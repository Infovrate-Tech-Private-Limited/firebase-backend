// functionParser.ts

import cors from "cors";
import express from "express";
import fileUpload from "express-fileupload";
import * as functions from "firebase-functions";
import { globSync } from "glob";
import { parse, ParsedPath, resolve } from "path";
import { Endpoint, ParserOptions, RequestType } from "./models";

// enable short hand for console.log()
const { log } = console;

/**
 * Config for the {@link FunctionParser} constructor
 */
interface FunctionParserOptions {
  rootPath: string;
  exports: any;
  options?: ParserOptions;
  verbose?: boolean;
}

/**
 * This class helps with setting up the exports for the cloud functions deployment.
 *
 * It takes in exports and then adds the required groups and their functions to it for deployment
 * to the cloud functions server.
 *
 * @export
 * @class FunctionParser
 */
export class FunctionParser {
  rootPath: string;
  enableCors: boolean;
  exports: any;
  verbose: boolean;

  /**
   * Creates an instance of FunctionParser.
   * @param {FunctionParserOptions} [props]
   * @memberof FunctionParser
   */
  constructor(props: FunctionParserOptions) {
    const { rootPath, exports, options, verbose = false } = props;
    if (!rootPath) {
      throw new Error("rootPath is required to find the functions.");
    }

    this.rootPath = rootPath;
    this.exports = exports;
    this.verbose = verbose;

    // Set default option values for if not provided
    this.enableCors = options?.enableCors ?? false;
    const groupByFolder: boolean = options?.groupByFolder ?? true;
    const buildReactive: boolean = options?.buildReactive ?? true;
    const buildEndpoints: boolean = options?.buildEndpoints ?? true;

    if (buildReactive) {
      this.buildReactiveFunctions(groupByFolder);
    }

    if (buildEndpoints) {
      this.buildRestfulApi(groupByFolder);
    }
  }

  /**
   * Looks for all files with .function.js and exports them on the group they belong to
   *
   * @private
   * @param {boolean} groupByFolder
   * @memberof FunctionParser
   */
  private buildReactiveFunctions(groupByFolder: boolean) {
    if (this.verbose) log("Reactive Functions - Building...");

    // Get all the files that has .function in the file name
    const functionFiles: string[] = globSync(
      `${this.rootPath}/**/*.function.js`,
      {
        cwd: this.rootPath,
        ignore: "./node_modules/**",
      },
    );

    functionFiles.forEach((file: string) => {
      const filePath: ParsedPath = parse(file);

      // ✅ Windows-safe split (handles / and \)
      const directories: string[] = filePath.dir.split(/[\\/]/);

      // Group name logic: pick parent folder (or last folder) safely
      const groupName: string = groupByFolder
        ? (directories.length >= 2 ? directories[directories.length - 2] : directories[0]) || ""
        : directories[directories.length - 1] || "";

      const functionName = filePath.name.replace(".function", "");

      if (
        !process.env.FUNCTION_NAME ||
        process.env.FUNCTION_NAME === functionName
      ) {
        if (!this.exports[groupName]) this.exports[groupName] = {};
        if (this.verbose)
          log(`Reactive Functions - Added ${groupName}/${functionName}`);

        // ✅ Require using absolute path so it resolves correctly no matter current module location
        const absPath = resolve(this.rootPath, file);
        this.exports[groupName] = {
          ...this.exports[groupName],
          ...require(absPath),
        };
      }
    });

    if (this.verbose) log("Reactive Functions - Built");
  }

  /**
   * Looks at all .endpoint.js files and adds them to the group they belong in
   *
   * @private
   * @param {boolean} groupByFolder
   * @memberof FunctionParser
   */
  private buildRestfulApi(groupByFolder: boolean) {
    if (this.verbose) log("Restful Endpoints - Building...");

    const apiFiles: string[] = globSync(`${this.rootPath}/**/*.endpoint.js`, {
      cwd: this.rootPath,
      ignore: "./node_modules/**",
    });

    const app = express();
    const groupRouters: Map<string, express.Router> = new Map();

    apiFiles.forEach((file: string) => {
      const filePath: ParsedPath = parse(file);

      // ✅ Windows-safe split (handles / and \)
      const directories: Array<string> = filePath.dir.split(/[\\/]/);

      const groupName: string = groupByFolder
        ? (directories.length >= 2 ? directories[directories.length - 2] : directories[0]) || ""
        : directories[directories.length - 1] || "";

      let currentRouter = groupRouters.get(groupName);

      if (!currentRouter) {
        const newRouter = express.Router();
        groupRouters.set(groupName, newRouter);
        currentRouter = newRouter;
      }

      const router = currentRouter as express.Router;

      try {
        this.buildEndpoint(file, groupName, router);
      } catch (e: any) {
        // ✅ Don’t hide the actual error
        const details = e?.stack || e?.message || String(e);
        throw new Error(
          `Restful Endpoints - Failed to add the endpoint defined in ${file} to the ${groupName} Api.\n` +
            `RootPath: ${this.rootPath}\n` +
            `Original error:\n${details}`,
        );
      }

      app.use("/", router);

      this.exports[groupName] = {
        ...this.exports[groupName],
        api: functions.https.onRequest(app),
      };
    });

    if (this.verbose) log("Restful Endpoints - Built");
  }

  /**
   * Parses a .endpoint.js file and sets the endpoint path on the provided router
   *
   * @private
   * @param {string} file
   * @param {string} groupName
   * @param router Express router instance
   * @memberof FunctionParser
   */
  private buildEndpoint(file: string, groupName: string, router: any) {
    const filePath: ParsedPath = parse(file);

    // ✅ Require using absolute path; also support both default export and module.exports
    const absPath = resolve(this.rootPath, file);
    const mod = require(absPath);
    const endpoint: Endpoint = (mod.default ?? mod) as Endpoint;

    const name: string =
      endpoint.name || filePath.name.replace(".endpoint", "");

    const { handler } = endpoint;

    // Enable cors if it is enabled globally else only enable it for a particular route
    if (this.enableCors) {
      router.use(cors());
    } else if (endpoint.options?.enableCors) {
      if (this.verbose) log(`Cors enabled for ${name}`);
      router.use(cors());
    }

    if (endpoint.options?.enableFileUpload) {
      if (this.verbose) log(`File upload enabled for ${name}`);
      router.use(fileUpload());
    }

    switch (endpoint.requestType) {
      case RequestType.GET:
        router.get(`/${name}`, endpoint.options?.middlewares ?? [], handler);
        break;

      case RequestType.POST:
        router.post(`/${name}`, endpoint.options?.middlewares ?? [], handler);
        break;

      case RequestType.PUT:
        router.put(`/${name}`, endpoint.options?.middlewares ?? [], handler);
        break;

      case RequestType.DELETE:
        router.delete(`/${name}`, endpoint.options?.middlewares ?? [], handler);
        break;

      case RequestType.PATCH:
        router.patch(`/${name}`, endpoint.options?.middlewares ?? [], handler);
        break;

      default:
        throw new Error(
          `An unsupported RequestType was defined for an Endpoint.\n` +
            `Please make sure the Endpoint file exports RequestType using the library's RequestType enum.\n` +
            `**This value is required to add the Endpoint to the API**`,
        );
    }

    if (this.verbose)
      log(
        `Restful Endpoints - Added ${groupName}/${endpoint.requestType}:${name}`,
      );
  }
}

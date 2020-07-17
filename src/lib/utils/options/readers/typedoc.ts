import * as Path from "path";
import * as FS from "fs";

import { OptionsReader } from "..";
import { Logger } from "../../loggers";
import { Options } from "../options";

/**
 * Obtains option values from typedoc.json
 * or typedoc.js (discouraged since ~0.14, don't fully deprecate until API has stabilized)
 */
export class TypeDocReader implements OptionsReader {
  /**
   * Should run before the tsconfig reader so that it can specify a tsconfig file to read.
   */
  order = 100;

  name = "typedoc-json";

  /**
   * Read user configuration from a typedoc.json or typedoc.js configuration file.
   * @param container
   * @param logger
   */
  read(container: Options, logger: Logger): void {
    const path = container.getValue("options");
    const file = this.findTypedocFile(path);

    if (!file) {
      if (!container.isDefault("options")) {
        logger.error(
          `The options file could not be found with the given path ${path}`
        );
      }
      return;
    }

    const seen = new Set<string>();
    this.readFile(file, container, logger, seen);
  }

  /**
   * Read the given options file + any extended files.
   * @param file
   * @param container
   * @param logger
   */
  private readFile(
    file: string,
    container: Options & { setValue(key: string, value: unknown): void },
    logger: Logger,
    seen: Set<string>
  ) {
    if (seen.has(file)) {
      logger.error(`Tried to load the options file ${file} multiple times.`);
      return;
    }
    seen.add(file);

    const fileContent: unknown = require(file);

    if (!isObject(fileContent)) {
      logger.error(`The file ${file} is not an object.`);
      return;
    }

    // clone option object to avoid of property changes in re-calling this file
    const { extends: extendedFile, ...options } = fileContent;

    if (extendedFile != null) {
      for (const extended of getStringArray(extendedFile)) {
        // Extends is relative to the file it appears in.
        this.readFile(
          Path.resolve(Path.dirname(file), extended),
          container,
          logger,
          seen
        );
      }
    }

    for (const [key, val] of Object.entries(options)) {
      try {
        container.setValue(key, val);
      } catch (error) {
        logger.error(error.message);
      }
    }
  }

  /**
   * Search for the typedoc.js or typedoc.json file from the given path
   *
   * @param  path Path to the typedoc.(js|json) file. If path is a directory
   *   typedoc file will be attempted to be found at the root of this path
   * @param logger
   * @return the typedoc.(js|json) file path or undefined
   */
  private findTypedocFile(path: string): string | undefined {
    path = Path.resolve(path);

    return [
      path,
      Path.join(path, "typedoc.json"),
      Path.join(path, "typedoc.js"),
    ].find((path) => FS.existsSync(path) && FS.statSync(path).isFile());
  }
}

function getStringArray(arg: unknown): string[] {
  return Array.isArray(arg) ? arg.map(String) : [String(arg)];
}

function isObject(arg: unknown): arg is Record<string, unknown> {
  return !!arg && typeof arg === "object";
}

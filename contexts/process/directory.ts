import processDirectoryDefaults from "contexts/process/directoryDefaults";
import processDirectoryGenerated from "contexts/process/directoryGenerated";

import type { Processes } from "./types";

const processDirectory: Processes = {
  ...processDirectoryDefaults,
  ...processDirectoryGenerated,
};

export default processDirectory;

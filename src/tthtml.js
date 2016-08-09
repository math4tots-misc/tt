const ttjs = require("./ttjs.js");
const ttutils = require("./ttutils.js");

const asyncMain = ttutils.asyncf(function*() {
  "use strict";
  const libfilenames = yield ttutils.asyncGetDirFilenames("lib");
  const libhtmlfns = yield ttutils.asyncGetDirFilenames("htmllib");
  const binfilenames = process.argv.slice(2);
  const filenames = libfilenames.concat(binfilenames).concat(libhtmlfns);
  const uriTextPairs = [];
  for (const filename of filenames) {
    let data = null;
    try {
      data = yield ttutils.asyncReadFile(filename);
    } catch (e) {
      console.error("Error while trying to read '" + filename + "'");
      console.error(e);
      process.exit(1);
    }
    uriTextPairs.push([filename, data]);
  }
  console.log("$(document).ready(() => {" +
              ttjs.compile(uriTextPairs) + "});");
});

if (require.main === module) {
  asyncMain();
}


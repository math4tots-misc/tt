const genjs = require("./genjs.js");
const ttutils = require("./ttutils.js");

const asyncMain = ttutils.asyncf(function*() {
  const libdirs = ["../lib", "../libhtml", "../libnode"];
  let filenames = process.argv.slice(2);
  for (const libdir of libdirs) {
    filenames =
        filenames.concat(yield ttutils.asyncGetDirFilenames(libdir));
  }
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
  try {
    // const start = Date.now();
    // console.log(genjs.compile(uriTextPairs, true));
    // console.error("Processing took: " + (Date.now()-start) + "ms");
    console.log(genjs.compile(uriTextPairs));
  } catch (e) {
    console.error("Compile error");
    console.error(e);
    process.exit(1);
  }
});

if (require.main === module) {
  asyncMain();
}

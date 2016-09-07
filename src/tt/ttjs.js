const tt = require("./tt.js");
(function() {
"use strict";

function asyncReadFile(path) {
  // NOTE: I don't want require here to be picked up by browserify
  const req = require;

  return new Promise((resolve, reject) => {
    const fs = req("fs");
    fs.readFile(path, (err, data) => {
      if (err) {
        reject(err);
      } else {
        resolve(data.toString());
      }
    });
  });
}

function asyncDir(path) {
  // NOTE: I don't want require here to be picked up by browserify
  const req = require;

  return new Promise((resolve, reject) => {
    const fs = req("fs");
    fs.readdir(path, (err, files) => {
      if (err) {
        reject(err);
      } else {
        resolve(files);
      }
    });
  });
}

const asyncGetDirFilenames = tt.asyncf(function*(dirname) {
  const path = require("path");
  const libdir = path.join(__dirname, dirname);
  let libfilenames = null;
  try {
    libfilenames = yield asyncDir(libdir);
    libfilenames = libfilenames.map(fn => path.join(libdir, fn));
  } catch (e) {
    console.error("Error while trying to read dir '" + libdir + "'");
    console.error(e);
    throw e;
  }
  return libfilenames;
});


const asyncMain = tt.asyncf(function*() {
  const libdirs = ["../lib", "../libhtml", "../libnode"];
  let filenames = process.argv.slice(2);
  for (const libdir of libdirs) {
    filenames =
        filenames.concat(yield asyncGetDirFilenames(libdir));
  }
  const uriTextPairs = [];
  for (const filename of filenames) {
    let data = null;
    try {
      data = yield asyncReadFile(filename);
    } catch (e) {
      console.error("Error while trying to read '" + filename + "'");
      console.error(e);
      process.exit(1);
    }
    uriTextPairs.push([filename, data]);
  }
  try {
    console.log(tt.compile(uriTextPairs));
  } catch (e) {
    console.error("Compile error");
    console.error(e);
    process.exit(1);
  }
});

if (require.main === module) {
  asyncMain();
}

})();

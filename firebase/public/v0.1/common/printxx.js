/* jshint esversion: 6 */
const xx = require('./xx');
const fs = require('fs');
inputs = process.argv.slice(2);

function readAll(paths, cb) {
  const result = [], errors = [];
  let len = paths.length;
  paths.forEach((path, k) => {
    fs.readFile(path, 'utf8', (err, data) => {
      len--;
      if (err) {
        throw err;
      } else {
        result[k] = [path, data];
      }
      if (len === 0) {
        cb(result);
      }
    });
  });
}

readAll(inputs, (result) => {
  const cg = new xx.CodeGenerator();
  for (const [path, data] of result) {
    cg.addModule(path, data);
  }
  cg.process();
  console.log(cg.compile());
});

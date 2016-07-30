// jshint esversion: 6
// For browser, use with browserify
const tt = require("./tt.js");
const ttutils = require("./ttutils.js");

const ttjs = Object.create(null);
(function(exports) {
"use strict";

function compile(uriTextPairs, nativeFunctionHandler) {
  return new Compiler(
      uriTextPairs,
      nativeFunctionHandler || defaultNativeFunctionHandler).compile();
}

function defaultNativeFunctionHandler(func, compiler) {
  // TODO: More robust way to handle this.
  const argtypes = func.args.map(arg => arg[1]);
  const name = compiler.getFunctionName(func.name, argtypes);

  if (func.name === "add" && argtypes.length === 2 &&
      ((argtypes[0].equals(new tt.Typename("Int")) &&
        argtypes[1].equals(new tt.Typename("Int"))) ||
       (argtypes[0].equals(new tt.Typename("Float")) &&
         argtypes[1].equals(new tt.Typename("Float"))) ||
       (argtypes[0].equals(new tt.Typename("Int")) &&
         argtypes[1].equals(new tt.Typename("Float"))) ||
       (argtypes[0].equals(new tt.Typename("Float")) &&
         argtypes[1].equals(new tt.Typename("Int"))) ||
       (argtypes[0].equals(new tt.Typename("String")) &&
        argtypes[1].equals(new tt.Typename("String"))))) {
    return "\nfunction " + name + "(stack, a, b)" +
           "\n{" +
           "\n  return a + b;" +
           "\n}";
  }

  if (func.name === "repr" && argtypes.length === 1 &&
      (argtypes[0].equals(new tt.Typename("Int")) ||
       argtypes[0].equals(new tt.Typename("Float")) ||
       argtypes[0].equals(new tt.Typename("Bool")))) {
    return "\nfunction " + name + "(stack, x)" +
           "\n{" +
           "\n  return '' + x;" +
           "\n}";
  }

  if (func.name === "print" && argtypes.length === 1 &&
      argtypes[0].equals(new tt.Typename("String"))) {
    return "\nfunction " + name + "(stack, x)" +
           "\n{" +
           "\n  console.log(x);" +
           "\n}";
  }

  if (func.name === "malloc" && argtypes.length === 1) {
    const clsnode = compiler.getClassNode(argtypes[0]);
    const attrs = clsnode.isNative ? "" : clsnode.attrs.map(attr => {
      const [name, type] = attr;
      return "\n  data.aa_" + name + " = " + getDefaultValue(type);
    }).join("");
    return "\nfunction " + name + "(stack, x)" +
           "\n{" +
           "\n  const data = Object.create(null);" +
           attrs +
           "\n  return data;" +
           "\n}";
  }

  if (func.name === "getStackTraceMessage" && argtypes.length === 0) {
    return "\nfunction " + name + "(stack)" +
           "\n{" +
           "\n  return getStackTraceMessage(stack);" +
           "\n}";
  }

  if (func.name === "typestr" && argtypes.length === 1) {
    return "\nfunction " + name + "(stack, x)" +
           "\n{" +
           "\n  return '" + argtypes[0].toString() + "';" +
           "\n}";
  }

  if (func.name === "lessThan" && argtypes.length === 2 &&
      ((argtypes[0].equals(new tt.Typename("Int")) &&
        argtypes[1].equals(new tt.Typename("Int"))) ||
       (argtypes[0].equals(new tt.Typename("Int")) &&
        argtypes[1].equals(new tt.Typename("Float"))) ||
       (argtypes[0].equals(new tt.Typename("Float")) &&
        argtypes[1].equals(new tt.Typename("Int"))) ||
       (argtypes[0].equals(new tt.Typename("Float")) &&
        argtypes[1].equals(new tt.Typename("Float"))) ||
       (argtypes[0].equals(new tt.Typename("Float")) &&
        argtypes[1].equals(new tt.Typename("Float")))
       (argtypes[0].equals(new tt.Typename("String")) &&
        argtypes[1].equals(new tt.Typename("String"))))) {
    return "\nfunction " + name + "(stack, a, b)" +
           "\n{" +
           "\n  return a < b;" +
           "\n}";
  }

  if (func.name === "len" && argtypes.length === 1 &&
      (argtypes[0] instanceof tt.TemplateType) &&
      argtypes[0].name === "List") {
    return "\nfunction " + name + "(stack, xs)" +
           "\n{" +
           "\n  return xs.length;" +
           "\n}";
  }

  if (func.name === "getItem" && argtypes.length === 2 &&
      (argtypes[0] instanceof tt.TemplateType) &&
      argtypes[0].name === "List" &&
      argtypes[1].equals(new tt.Typename("Int"))) {
    return "\nfunction " + name + "(stack, xs, i)" +
           "\n{" +
           "\n  if (i < 0 || i >= xs.length) {" +
           "\n    throw new Error('Index out of bounds: i = ' + i + " +
                                 "'xs.length = ' + xs.length);" +
           "\n  }" +
           "\n  return xs[i];" +
           "\n}";
  }

  if (func.name === "logicalNot" && argtypes.length === 1 &&
      argtypes[0].equals(new tt.Typename("Bool"))) {
    return "\nfunction " + name + "(stack, x)" +
           "\n{" +
           "\n  return !x;" +
           "\n}";
  }

  if (func.name === "isSameAs" && argtypes.length === 2 &&
      argtypes[0].equals(argtypes[1])) {
    return "\nfunction " + name + "(stack, a, b)" +
           "\n{" +
           "\n  return a === b;" +
           "\n}";
  }

  throw new tt.CompileError(
      "Unimplemented native function: " +
      tt.serializeFunctionInstantiation(
          func.name, argtypes) + func.ret.toString(), []);
}

function getDefaultValue(type) {
  if (type instanceof tt.Typename) {
    switch(type.name) {
    case "Int": return "0";
    case "Float": return "0.0";
    case "String": return "''";
    }
  } else if (type instanceof tt.TemplateType) {
    switch(type.name) {
    case "List": return "[]";
    }
  }
  return "null";
}

const nativePrelude = `
//// Begin native prelude
function pop(stack, value) {
  stack.pop();
  return value;
}
function padstr(str, len) {
  if (str.length < len) {
    return str + " ".repeat(len-str.length);
  } else {
    return str;
  }
}
function getStackTraceMessage(stack) {
  let message = "\\nMost recent call last:";
  for (const tag of stack) {
    const [funcname, uri, lineno] = tagList[tag].split("@");
    message += "\\n  " + padstr(funcname, 20) +
               "in " + padstr("'" + uri + "'", 20) +
               "line " + padstr(lineno, 5);
  }
  return message;
}
//// End native prelude`;

class Compiler {
  constructor(uriTextPairs, nativeFunctionHandler) {
    this._uriTextPairs = uriTextPairs;
    this._nextId = 1;
    this._fnameCache = Object.create(null);
    this._nativeFunctionHandler = nativeFunctionHandler;
    this._tagCache = Object.create(null);
    this._tagList = [];
    this._program = tt.parseAndAnnotate(this._uriTextPairs);
    this._funcs = this._program.funcs;
    this._clss = this._program.clss;
    this._currentFunctionContext = null;
  }
  getNewId() {
    return this._nextId++;
  }
  getFunctionName(name, argtypes) {
    const key = tt.serializeFunctionInstantiation(name, argtypes);
    if (!this._fnameCache[key]) {
      this._fnameCache[key] = name + "__$" + this.getNewId();
    }
    return this._fnameCache[key];
  }
  getClassNode(cls) {
    for (const c of this._clss) {
      if (c.pattern.equals(cls)) {
        return c;
      }
    }
    return null;
  }
  compile() {
    let result = "// Autogenerated by the tt->js compiler";
    result += "\n(function() {";
    result += '\n"use strict";';
    result += nativePrelude;
    const funcs = this._funcs;
    for (const func of funcs) {
      result += this.compileFunction(func);
    }
    result += "\n// --- tag list, for generating helpful stack traces ---";
    result += "\nconst tagList = " + JSON.stringify(this._tagList) + ";";
    result += "\n// --- finally, call main ---";
    result += "\n" + this.getFunctionName("main", []) + "([]);";
    result += "\n})();";
    return result.trim();
  }
  compileFunction(func) {
    const token = func.token;
    const argnames = func.args.map(arg => arg[0]);
    const argtypes = func.args.map(arg => arg[1]);
    const name = this.getFunctionName(func.name, argtypes);
    if (func.isNative) {
      return "\n\n// native function: " +
             tt.serializeFunctionInstantiation(func.name, argtypes) +
             func.ret.toString() +
             this._nativeFunctionHandler(func, this);
    }
    this._currentFunctionContext =
        tt.serializeFunctionInstantiation(func.name, argtypes);
    const compiledBody = this.compileStatement(func.body);
    this._currentFunctionContext = null;
    return "\n\nfunction " + name + "(stack" +
           func.args.map(arg =>
             ", var_" + arg[0] + "/*" + arg[1].toString() + "*/")
                .join("") +
           ") /*" + func.ret.toString() + "*/" + compiledBody;
  }
  compileStatement(node) {
    switch(node.type) {
    case "Block":
      const stmts = node.stmts.map(stmt => this.compileStatement(stmt));
      return "\n{" + stmts.join("").replace(/\n/g, "\n  ") + "\n}";
    case "ExpressionStatement":
      return "\n" + this.compileTopLevelExpression(node.expr) + ";";
    case "ReturnStatement":
      if (node.expr === null) {
        return "\nreturn;";
      }
      return "\nreturn " + this.compileTopLevelExpression(node.expr) + ";";
    case "Declaration":
      const val = node.val === null ?
          "" : " = " + this.compileExpression(node.val);
      return "\nlet var_" + node.name + val + ";";
    case "For":
      return "\nfor (" + this.compileStatement(node.init).trim() +
             this.compileExpression(node.cond) + ";" +
             this.compileExpression(node.incr) + ")" +
             this.compileStatement(node.body);
    case "If":
      let str = "\nif (" + this.compileExpression(node.cond) + ")" +
                this.compileStatement(node.body);
      if (node.other !== null) {
        str += "\nelse" + this.compileStatement(node.other);
      }
      return str;
    default:
      throw new tt.CompileError(
          "Unrecognized statement: " + node.type, [node.token]);
    }
  }
  compileTopLevelExpression(node) {
    const tag = this.getTagFromToken(node.token);
    return "(stack.push(" + tag + "),pop(stack," +
           this.compileExpression(node) + "))";
  }
  compileExpression(node) {
    switch(node.type) {
    case "FunctionCall":
      const fname = node.name;
      const args = node.args;
      const argtypes = args.map(arg => arg.exprType);
      return this.getFunctionName(fname, argtypes) + "(stack" +
             args.map(arg => "," + this.compileExpression(arg)).join("") +
             ")";
    case "Int":
    case "Float":
      return node.val;
    case "String":
      return '"' + ttutils.sanitizeString(node.val) + '"';
    case "Name":
      return "var_" + node.name;
    case "TypeExpression":
      return "undefined";
    case "ListDisplay":
      return "[" + node.exprs.map(expr => this.compileExpression(expr)) + "]";
    case "Assign":
      return "(var_" + node.name + " = " +
             this.compileExpression(node.val) + ")";
    case "AugmentAssign":
      return "(var_" + node.name + " " + node.op + " " +
             this.compileExpression(node.val) + ")";
    default:
      throw new tt.CompileError(
          "Unrecognized expression: " + node.type, [node.token]);
    }
  }
  getTagFromToken(token) {
    const message = token.getTagMessage(this._currentFunctionContext);
    if (this._tagCache[message] === undefined)  {
      this._tagCache[message] = this._tagList.length;
      this._tagList.push(message);
    }
    return this._tagCache[message];
  }
}

const asyncMain = ttutils.asyncf(function*() {
  const filenames = process.argv.slice(2);
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
  console.log(compile(uriTextPairs));
});

if (require.main === module) {
  asyncMain();
}

})(ttjs);
module.exports = ttjs;


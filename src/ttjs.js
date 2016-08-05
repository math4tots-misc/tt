// jshint esversion: 6
// For browser, use with browserify
const tt = require("./tt.js");
const ttutils = require("./ttutils.js");

const ttjs = Object.create(null);
(function(exports) {
"use strict";

class CompilationContext {
  constructor(compiler, func) {
    this.compiler = compiler;
    this.func = func;
  }
  getTypeOfArgumentAtIndex(i) {
    return this.func.args[i][1];
  }
  getCurrentFunctionName() {
    return this.compiler.getFunctionNameFromFunctionNode(this.func);
  }
  getClassFromType(type) {
    return this.compiler.getClassFromType(type);
  }
  getDefaultValue(type) {
    return getDefaultValue(type);
  }
}

function compile(uriTextPairs) {
  return new Compiler(uriTextPairs).compile();
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

function doEval(str) {
  // jshint evil: true
  return eval(str);
}

class Compiler {
  constructor(uriTextPairs) {
    this._uriTextPairs = uriTextPairs;
    this._nextId = 1;
    this._fnameCache = Object.create(null);
    this._tagCache = Object.create(null);
    this._tagList = [];
    this._program = tt.parseAndAnnotate(this._uriTextPairs);
    this._funcs = this._program.funcs;
    this._clss = this._program.clss;
    this._decls = this._program.decls;
    this._currentFunctionContext = null;
    this._typeToClassCache = Object.create(null);

    for (const func of this._funcs) {
      this.initializeFunctionNameFromNode(func);
    }
  }
  getNewId() {
    return this._nextId++;
  }
  initializeFunctionNameFromNode(node) {
    const name = node.name;
    const argtypes = node.args.map(arg => arg[1]);
    const key = tt.serializeFunctionInstantiation(name, argtypes);
    this._fnameCache[key] = name + "__$" + this.getNewId();
  }
  getClassFromType(type) {
    const key = type.toString();
    if (!this._typeToClassCache[key]) {
      for (const cls of this._clss) {
        if (cls.pattern.equals(type)) {
          this._typeToClassCache[key] = cls;
          break;
        }
      }
      if (!this._typeToClassCache[key]) {
        throw new Error(key);
      }
    }
    return this._typeToClassCache[key];
  }
  getFunctionNameFromNameAndArgtypes(name, argtypes, tokens) {
    const key = tt.serializeFunctionInstantiation(name, argtypes);
    if (!this._fnameCache[key]) {
      throw new tt.CompileError("No such function: " + key, tokens || []);
    }
    return this._fnameCache[key];
  }
  getFunctionNameFromFunctionNode(node) {
    const name = node.name;
    const argtypes = node.args.map(arg => arg[1]);
    const key = tt.serializeFunctionInstantiation(name, argtypes);
    if (!this._fnameCache[key]) {
      throw new tt.CompileError(
          "Function never instantiated: " + key, []);
    }
    return this._fnameCache[key];
  }
  getFunctionNameFromFunctionCallNode(node) {
    const name = node.name;
    const argtypes = node.args.map(arg => arg.exprType);
    const key = tt.serializeFunctionInstantiation(name, argtypes);
    if (!this._fnameCache[key]) {
      throw new tt.CompileError(
          "Function never instantiated: " + key, [node.token]);
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
    result += "\n// --- global variable declarations ---";
    for (const decl of this._decls) {
      result += this.compileStatement(decl);
    }
    result += "\n// --- function definitions ---";
    const funcs = this._funcs;
    for (const func of funcs) {
      result += this.compileFunction(func);
    }
    result += "\n// --- tag list, for generating helpful stack traces ---";
    result += "\nconst tagList = " + JSON.stringify(this._tagList) + ";";
    result += "\n// --- call all the static stuff ---";
    for (const func of funcs) {
      if (func.isStatic) {
        result +=
            "\n" + this.getFunctionNameFromNameAndArgtypes(func.name, []) +
            "([]);";
      }
    }
    result += "\n// --- finally call main ---";
    result += "\n" + this.getFunctionNameFromNameAndArgtypes("main", []) +
              "([]);";
    result += "\n})();";
    return result.trim();
  }
  compileFunction(func) {
    const token = func.token;
    const argnames = func.args.map(arg => arg[0]);
    const argtypes = func.args.map(arg => arg[1]);
    const name = this.getFunctionNameFromFunctionNode(func);
    const args = "(stack" +
                 func.args.map(arg =>
                   ", var_" + arg[0] + "/*" + arg[1].toString() + "*/")
                      .join("") + ") /*" + func.ret.toString() + "*/";
    if (func.isNative) {
      let body = func.body;
      if (body.startsWith("eval")) {
        const f = doEval(body.slice("eval".length));
        body = f(new CompilationContext(this, func));
      }
      return "\n\n// native function: " +
             tt.serializeFunctionInstantiation(func.name, argtypes) +
             func.ret.toString() +
             "\nfunction " + name + args + "\n{" + body + "\n}";
    }
    this._currentFunctionContext =
        tt.serializeFunctionInstantiation(func.name, argtypes);
    const compiledBody = this.compileStatement(func.body);
    this._currentFunctionContext = null;
    return "\n\nfunction " + name + args + compiledBody;
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
      const keyword = node.isFinal ? "const" : "let";
      const val = node.val === null ?
          "" : " = " + this.compileExpression(node.val);
      return "\n" + keyword + " var_" + node.name + val + ";";
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
      return this.getFunctionNameFromFunctionCallNode(node) + "(stack" +
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
    case "GetAttribute":
      return this.compileExpression(node.owner) + ".aa" + node.name;
    case "SetAttribute":
      return this.compileExpression(node.owner) + ".aa" + node.name +
             " = " + this.compileExpression(node.val);
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
  const path = require("path");
  const binfilenames = process.argv.slice(2);
  const libdir = path.join(__dirname, "lib");
  let libfilenames = null;
  try {
    libfilenames = yield ttutils.asyncDir(libdir);
    libfilenames = libfilenames.map(fn => path.join(libdir, fn));
  } catch (e) {
    console.error("Error while trying to read dir '" + libdir + "'");
    console.error(e);
    process.exit(1);
  }
  const filenames = libfilenames.concat(binfilenames);
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


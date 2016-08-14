// jshint esversion: 6
// For browser, use with browserify
const tt = Object.create(null);
(function(exports) {
"use strict";
Error.stackTraceLimit = Infinity;

// TODO: mark some functions as constexpr -- that is functions that
// can be evaluated at compile time for use in compile time debugging
// and operations. And also implement those for compile time evaluation.

// TODO: Right now, final variables are not enforced in the annotation
// phase. Modify the code such that you get a compile time error if you
// try to assign to a final variable.

// TODO: Right now you can refer to any variable in scope from a lambda
// function. However, I want to limit this only to final variables like
// in Java. The behavior right now is ok for javascript, but may cause
// strange behavior in languages like Java/C++ where the variables cannot
// outlive the stack frame of the function in which it was declared.

// TODO: Static assert statements to test compile time instantiation
// logic.

// TODO: Allow spread operator to appear at any position, not just the end.
// If the spread operator appears in the middle, or there are multiple of
// them, they could match e.g. the way regular expressions match.
// One possible idea: if there is at least one possible substitution,
// the match will succeed. To disambiguate, consider matching greedily
// from left to right

// TODO: Consider adding compile time checks to make sure that all Promises
// are awaited on (etiher call startAsync or actually use the await
// keyword).
// Right now, I have runtime checks in ttjs for this.

// TODO: Optimization. Allow marking methods as nothrow/constexpr/nostack,
// such that functions marked as such are not passed an explicit stack.
// This will probably make it a lot easier for the closure compiler to
// inline common functions like __add__(Int, Int) to the native add operator.

// TODO: Abstract types. Allow types/classes to be marked abstract.
// Abstract types are like normal types except that no runtime value
// can have an abstract type as its type.
// For instance, no runtime value should actually have a "SymbolType" as
// its type. So all Symbol types would be abstract.
// I should also let classes be marked abstract. Such that they are used
// for namespacing, and other type-fu, but not as an actual type for
// a variable.

// TODO: Abstract functions. Like normal functions, but have no bodies.
// They would be used purely as functions that take types as input and
// types as output.

// TODO: Function call type expressions. Abstract functions would be
// basically useless without this. Allow specifying types with return types
// of functions. Coming up with a nice clean syntax for this might be
// tricky. Low priority though, since it doesn't seem all that critical
// to have this feature right now.

// TODO: Figure out how I'm going to handle iterables. E.g. I would
// rather that 'Table[$V]'.keys() return an iterable than a list.
// For now I'm using the getListOfKeys() method to separate it,
// but eventually I think I'd want something more convenient.

// error
class CompileError extends Error {
  constructor(message, tokens) {
    super(message + tokens.map(token => token.getLocationMessage()).join(""));
  }
}

class InstantiationError extends CompileError {
  constructor(message, frames) {
    super(message +
          frames.map(frame =>
              frame.getFrameMessage()).join("").replace(/\n/g, "\n  "),
          []);
  }
}

class InstantiationFrame {
  constructor(token, context) {
    this.token = token;
    this.context = context;
  }
  getFrameMessage() {
    return "\nwhile instantiating " + this.context + " " +
           this.token.getLocationMessage().trim();
  }
}

function assertEqual(left, right) {
  if (left !== right) {
    throw new CompileError(
        "assertEqual failed: left = " + left + ", right = " + right, []);
  }
}

// Source, Token

class Source {
  constructor(uri, text) {
    this.uri = uri;
    this.text = text;
  }
}

class Token {
  constructor(source, pos, type, val) {
    this.source = source;
    this.pos = pos;
    this.type = type;
    this.val = val;
    this.funcname = null;  // filled in during parsing
    this.funcnameset = false;
  }
  getLineNumber() {
    let ln = 1;
    const text = this.source.text;
    for (let i = 0; i < this.pos; i++) {
      if (text[i] === "\n") {
        ln++;
      }
    }
    return ln;
  }
  getFunctionName() {
    if (this.funcname === null) {
      throw new CompileError("No function name for " + this, []);
    }
    return this.funcname;
  }
  setFunctionName(name) {
    if (this.funcnameset) {
      throw new CompileError("Function name already set for " + this, []);
    }
    this.funcname = name;
    this.funcnameset = true;
  }
  getColumnNumber() {
    let cn = 1;
    const text = this.source.text;
    for (let i = this.pos; i > 0 && text[i-1] !== "\n"; i--) {
      cn++;
    }
    return cn;
  }
  getLine() {
    let start = this.pos, end = this.pos;
    const text = this.source.text;
    while (start > 0 && text[start-1] !== "\n") {
      start--;
    }
    while (end < text.length && text[end] !== "\n") {
      end++;
    }
    return text.slice(start, end);
  }
  getLocationMessage() {
    return "\nin " + this.source.uri + ", line " + this.getLineNumber() +
           "\n" + this.getLine() +
           "\n" + " ".repeat(this.getColumnNumber()-1) + "*";
  }
  toString() {
    return "Token(" + this.type + ", " + this.val + ")";
  }
  inspect() {
    return this.toString();
  }
  getTagMessage(context) {
    return context + "@" + this.source.uri + "@" +
           this.getLineNumber();
  }
}

// Type

class Type {}

class Typename extends Type {
  constructor(name) {
    super();
    this.name = name;
  }
  equals(other) {
    return other instanceof Typename && this.name === other.name;
  }
  toString() {
    return this.name;
  }
  inspect() {
    return "Typename(" + this.name + ")";
  }
}

class SymbolType extends Type {
  constructor(name) {
    super();
    this.name = name;
  }
  equals(other) {
    return other instanceof SymbolType && this.name === other.name;
  }
  toString() {
    return ":" + this.name;
  }
  inspect() {
    return "SymbolType(" + this.name + ")";
  }
}

class TemplateType extends Type {
  constructor(name, args) {
    super();
    this.name = name;  // TYPENAME
    this.args = args;  // [Type]
  }
  equals(other) {
    if (!(other instanceof TemplateType)) {
      return false;
    }
    if (this.args.length !== other.args.length) {
      return false;
    }
    for (let i = 0; i < this.args.length; i++) {
      if (!this.args[i].equals(other.args[i])) {
        return false;
      }
    }
    return true;
  }
  toString() {
    return this.name + "[" +
           this.args.map(arg => arg.toString()).join(",") + "]";
  }
  inspect() {
    return "TemplateType(" + this.name + ", [" +
           this.args.map(arg => arg.toString()).join(", ") + "])";
  }
}

// TypeTemplate

class TypeTemplate {
  constructor(token) {
    this.token = token;
  }
  isFreeVar(boundVars) {
    return this instanceof VariableTypeTemplate &&
           this.hasFreeVars(boundVars);
  }
  hasFreeVars(boundVars) {
    return Object.keys(this.getFreeVars(boundVars)).length > 0;
  }
  compareSpecialization(other, boundVars, otherBoundVars) {
    // returns 1 (i.e. this > otherTemplate) if this is more specialized
    // returns 0 (i.e. this == otherTemplate) if the level is the same
    // returns -1 (i.e. this < otherTemplate) if other is more specialized
    boundVars = boundVars || Object.create(null);
    otherBoundVars = otherBoundVars || Object.create(null);
    const thisHasFreeVars = this.hasFreeVars(boundVars);
    const otherHasFreeVars = other.hasFreeVars(otherBoundVars);
    if (!thisHasFreeVars && !otherHasFreeVars) {
      return 0;
    }
    if (!thisHasFreeVars && otherHasFreeVars) {
      return 1;
    }
    if (thisHasFreeVars && !otherHasFreeVars) {
      return -1;
    }
    const thisIsFreeVar = this.isFreeVar(boundVars);
    const otherIsFreeVar = other.isFreeVar(otherBoundVars);
    if (thisIsFreeVar && otherIsFreeVar) {
      return 0;
    }
    if (!thisIsFreeVar && otherIsFreeVar) {
      return 1;
    }
    if (thisIsFreeVar && !otherIsFreeVar) {
      return -1;
    }
    // At this point, both sides have some free vars, but neither of them
    // *is* a free var. This must mean that they are both
    // TemplateTypeTemplates.
    const args = this.args;
    const oargs = other.args;
    const len = Math.min(args.length, oargs.length);
    boundVars = Object.create(boundVars);
    otherBoundVars = Object.create(otherBoundVars);
    for (let i = 0; i < len; i++) {
      const result = args[i].compareSpecialization(
          oargs[i], boundVars, otherBoundVars);
      if (result !== 0) {
        return result;
      }
      for (const freeVar in args[i].getFreeVars(boundVars)) {
        boundVars[freeVar] = true;
      }
      for (const freeVar in oargs[i].getFreeVars(otherBoundVars)) {
        otherBoundVars[freeVar] = true;
      }
    }
    // If one has vararg and the other doesn't, the one that doesn't have
    // a vararg is more specialized.
    if (this.vararg === null && other.vararg !== null) {
      return 1;
    }
    if (this.vararg !== null && other.vararg === null) {
      return -1;
    }
    // They either both have varargs, or they both don't.
    // If they both don't have varargs, it's not really comparable, so
    // ordering doesn't matter as long as we are consistent.
    // On the other hand, if they both have varargs, the type template
    // with more explicit explicit arguemnts is more specialized.
    if (args.length !== oargs.length) {
      // We don't *really* care if the lengths aren't the same.
      // Just to be consistent about the ordering, let's say that
      // longer means more specialized.
      return args.length < oargs.length ? -1 : 1;
    }
    return 0;
  }
}

class TypenameTemplate extends TypeTemplate {
  constructor(token, name) {
    super(token);
    this.name = name;
  }
  bindType(type, bindings) {
    bindings = bindings || Object.create(null);
    if (!(type instanceof Typename) || this.name !== type.name) {
      return null;
    }
    return bindings;
  }
  getFreeVars(boundVars) {
    return Object.create(null);
  }
  resolve(bindings) {
    return new Typename(this.name);
  }
  serialize(bindings) {
    return this.name;
  }
}

class SymbolTypeTemplate extends TypeTemplate {
  constructor(token, name) {
    super(token);
    this.name = name;
  }
  bindType(type, bindings) {
    bindings = bindings || Object.create(null);
    if (!(type instanceof SymbolType) || this.name !== type.name) {
      return null;
    }
    return bindings;
  }
  getFreeVars(boundVars) {
    return Object.create(null);
  }
  resolve(bindings) {
    return new SymbolType(this.name);
  }
  serialize(bindings) {
    return ":" + this.name;
  }
}

class TemplateTypeTemplate extends TypeTemplate {
  constructor(token, name, args, vararg) {
    super(token);
    this.name = name;  // TYPENAME
    this.args = args;  // [TypeTemplate]
    this.vararg = vararg || null;  // null|TYPENAME
  }
  bindType(type, bindings) {
    bindings = bindings || Object.create(null);
    if (!(type instanceof TemplateType) || this.name !== type.name) {
      return null;
    }
    if (this.vararg === null && this.args.length !== type.args.length ||
        this.args.length > type.args.length) {
      return null;
    }
    for (let i = 0; i < this.args.length; i++) {
      if (this.args[i].bindType(type.args[i], bindings) === null) {
        return null;
      }
    }
    if (this.vararg !== null) {
      const rest = [];
      for (let i = this.args.length; i < type.args.length; i++) {
        rest.push(type.args[i]);
      }
      const key = "..." + this.vararg;
      if (bindings[key]) {
        const oldRest = bindings[key];

        // If this 'vararg' name already exists, make sure that they match
        // this comparison is simpler since these should be a list of
        // concrete types
        if (oldRest.length !== rest.length) {
          return null;
        }
        const len = rest.length;
        for (let i = 0; i < len; i++) {
          if (!rest[i].equals(oldRest[i])) {
            return null;
          }
        }
      } else {
        bindings["..." + this.vararg] = rest;
      }
    }
    return bindings;
  }
  getFreeVars(boundVars) {
    const freeVars = Object.create(null);
    for (const arg of this.args) {
      for (const freeVar in arg.getFreeVars(boundVars)) {
        freeVars[freeVar] = true;
      }
    }
    return freeVars;
  }
  resolve(bindings) {
    const args = this.args.map(arg => arg.resolve(bindings));
    if (this.vararg) {
      const key = "..." + this.vararg;
      if (!bindings[key]) {
        throw new CompileError(
            "Tried to resolve type template for " + key + " but no " +
            "binding found", [this.token]);
      }
      for (const arg of bindings[key]) {
        args.push(arg);
      }
    }
    return new TemplateType(this.name, args);
  }
  serialize(bindings) {
    bindings = bindings || {_nextIndex: 0};
    let args = this.args.map(arg => arg.serialize(bindings)).join(",");
    let vararg = "";
    if (this.vararg !== null) {
      if (bindings["..." + this.vararg] === undefined) {
        bindings["..." + this.vararg] = bindings._nextIndex++;
      }
      vararg = "..." + bindings["..." + this.vararg];
    }
    return this.name + "[" + args + vararg + "]";
  }
}

class VariableTypeTemplate extends TypeTemplate {
  constructor(token, name) {
    super(token);
    this.name = name;
  }
  bindType(type, bindings) {
    bindings = bindings || Object.create(null);
    if (bindings[this.name]) {
      if (bindings[this.name].equals(type)) {
        return bindings;
      } else {
        return null;
      }
    } else {
      bindings[this.name] = type;
      return bindings;
    }
  }
  getFreeVars(boundVars) {
    const freeVars = Object.create(null);
    if (!boundVars[this.name]) {
      freeVars[this.name] = true;
    }
    return freeVars;
  }
  resolve(bindings) {
    if (!bindings[this.name]) {
      throw new CompileError(
          "Tried to resolve type template for $" + this.name + " but no " +
          "binding found", [this.token]);
    }
    return bindings[this.name];
  }
  serialize(bindings) {
    bindings = bindings || {_nextIndex: 0};
    if (bindings["$" + this.name] === undefined) {
      bindings["$" + this.name] = bindings._nextIndex++;
    }
    return "$" + bindings["$" + this.name];
  }
}

// Lexer

const keywords = [
  "fn", "class", "let", "final", "static", "native", "async", "await",
  "return",
  "is", "not", "in",
  "for", "if", "else", "while", "break", "continue",
  "true", "false", "null",

  "and", "or",
  "var", "const", "goto", "function", "def", "const",
  "package", "import", "as",
];
const symbols = [
  "(", ")", "[", "]", "{", "}", ",", ".", "...",
  ";", "#", "$", "=",
  "+", "-", "*", "/", "%", "++", "--",
  "&&", "||", "?", ":",
  "==", "!=", "<", ">", "<=", ">=", "!",
  "+=", "-=", "*=", "/=", "%=",
].sort().reverse();
const openParen = "(";
const closeParen = ")";
const openBracket = "[";
const closeBracket = "]";
const openBrace = "{";
const closeBrace = "}";

function isKeyword(name) {
  return keywords.indexOf(name) !== -1;
}

function isTypename(name) {
  return name[0].toUpperCase() === name[0] &&
         name[0].toLowerCase() !== name[0];
}

function isDigit(ch) {
  return /\d/.test(ch);
}

function isNameChar(ch) {
  return /\w/.test(ch);
}

class Lexer {
  constructor(uri, text) {
    this._source = new Source(uri, text);
    this._text = text;
    this._pos = 0;
    this._peek = this._extract();
  }
  peek() {
    return this._peek;
  }
  next() {
    const token = this._peek;
    this._peek = this._extract();
    return token;
  }
  _ch(dx) {
    const text = this._text;
    const pos = this._pos + (dx || 0);
    return pos < text.length ? text[pos] : "";
  }
  _startsWith(prefix) {
    return this._text.startsWith(prefix, this._pos);
  }
  _skipWhitespaceAndComments() {
    while (this._ch() !== "" &&
           (" \r\n\t".indexOf(this._ch()) !== -1 ||
            this._startsWith("//") ||
            this._startsWith("/*"))) {
      if (this._startsWith("//")) {
        while (this._ch() !== "" && this._ch() !== "\n") {
          this._pos++;
        }
      } else if (this._startsWith("/*")) {
        const start = this._pos;
        this._pos += 2;
        while (this._ch() !== "" && !this._startsWith("*/")) {
          this._pos++;
        }
        if (this._ch() === "") {
          throw new CompileError(
              "Unterminated multiline comment",
              [new Token(this._source, start, "ERROR")]);
        }
        this._pos += 2;
      } else {
        this._pos++;
      }
    }
  }
  _extract() {
    this._skipWhitespaceAndComments();
    if (this._ch() === "") {
      return new Token(this._source, this._pos, "EOF");
    }
    const start = this._pos;
    // STRING
    if (this._startsWith('r"') || this._startsWith('"') ||
        this._startsWith("r'") || this._startsWith("'")) {
      let raw = false;
      if (this._ch() === "r") {
        raw = true;
        this._pos++;
      }
      let quote = this._ch();
      if (this._startsWith(quote.repeat(3))) {
        quote = quote.repeat(3);
      }
      this._pos += quote.length;
      let str = "";
      while (this._ch() !== "" && !this._startsWith(quote)) {
        if (!raw && this._ch() === "\\") {
          this._pos++;
          switch(this._ch()) {
          case "t": str += "\t"; break;
          case "n": str += "\n"; break;
          case "f": str += "\f"; break;
          case "r": str += "\r"; break;
          case "\\": str += "\\"; break;
          case "'": str += "'"; break;
          case '"': str += '"'; break;
          default:
            throw new CompileError(
                "Unrecognized string escape",
                [new Token(this._source, this._pos, "ERROR")]);
          }
          this._pos++;
        } else {
          str += this._ch();
          this._pos++;
        }
      }
      this._pos += quote.length;
      return new Token(this._source, start, "STRING", str);
    }
    // INT/FLOAT
    let foundDigit = false, foundDot = false;
    while (isDigit(this._ch())) {
      this._pos++;
      foundDigit = true;
    }
    if (this._ch() === ".") {
      this._pos++;
      foundDot = true;
    }
    while (isDigit(this._ch())) {
      this._pos++;
      foundDigit = true;
    }
    if (foundDigit) {
      const val = this._text.slice(start, this._pos);
      if (foundDot) {
        return new Token(this._source, start, "FLOAT", val);
      } else {
        return new Token(this._source, start, "INT", val);
      }
    } else {
      this._pos = start;
    }
    // NAME/TYPENAME/KEYWORD
    while (isNameChar(this._ch())) {
      this._pos++;
    }
    if (start !== this._pos) {
      const name = this._text.slice(start, this._pos);
      const type =
          isKeyword(name) ? name :
          isTypename(name) ? "TYPENAME" :
          "NAME";
      return new Token(
          this._source, start, type, type === name ? undefined : name);
    }
    // SYMBOL
    for (const symbol of symbols) {
      if (this._startsWith(symbol)) {
        this._pos += symbol.length;
        return new Token(this._source, start, symbol);
      }
    }
    // ERROR
    const token = new Token(this._source, start, "ERROR");
    throw new CompileError("Unrecognized token", [token]);
  }
}

function lex(uri, text) {
  const lexer = new Lexer(uri, text);
  const tokens = [];
  while (lexer.peek().type !== "EOF") {
    tokens.push(lexer.next());
  }
  tokens.push(lexer.peek());
  return tokens;
}

{
  const tokens = lex("<test>", "aa Bb class 1 2.4 'hi' ++");
  const types = tokens.map(token => token.type).join(",");
  assertEqual("NAME,TYPENAME,class,INT,FLOAT,STRING,++,EOF", types);
  const vals = tokens
      .map(token => token.val).map(val => val === undefined ? "" : val)
      .join(",");
  assertEqual("aa,Bb,,1,2.4,hi,,", vals);
}

// parser

const augmentAssignOperands = [
  "+=", "-=",  "/=",  "*=", "%=",
  "++", "--",
];

// HACK: staticBlockIds have to be unique across the entire program.
// TODO: Pay back this code debt.
let nextStaticBlockId = 0;

class Parser {
  constructor(uri, text) {
    this._tokens = lex(uri, text);
    this._pos = 0;
    this._funcname = null;
    this._staticBlockId = 0;
    this._insideAsync = false;
  }
  getNextStaticBlockId() {
    return nextStaticBlockId++;
  }
  peek(dx) {
    const pos = Math.min(this._pos + (dx || 0), this._tokens.length-1);
    return this._tokens[pos];
  }
  next() {
    const token = this._tokens[this._pos++];
    token.setFunctionName(this._funcname);
    return token;
  }
  at(type, dx) {
    return this.peek(dx).type === type;
  }
  consume(type) {
    if (this.at(type)) {
      return this.next();
    }
  }
  expect(type) {
    if (!this.at(type)) {
      throw new CompileError(
          "Expected " + type + " but got " + this.peek(), [this.peek()]);
    }
    return this.next();
  }
  parseModule() {
    const token = this.peek();
    const functemps = [];
    const classtemps = [];
    const decltemps = [];
    while (!this.at("EOF")) {
      if (this.at("static") || this.at("fn")) {
        functemps.push(this.parseFunctionTemplate());
      } else if (this.at("class")) {
        classtemps.push(this.parseClassTemplate());
      } else if (this.at("let") || this.at("final")) {
        decltemps.push(this.parseStatementTemplate());
      } else {
        throw new CompileError(
            "Expected function, class or variable declaration",
            [this.peek()]);
      }
    }
    return {
      "type": "UnexpandedModule",
      "token": token,
      "functemps": functemps,
      "classtemps": classtemps,
      "decltemps": decltemps,
    };
  }
  parseClassTemplate() {
    const token = this.expect("class");
    const isNative = !!this.consume("native");
    const pattern = this.parseTypeTemplate();
    let attrs = null;
    if (isNative) {
      this.expect(";");
    } else {
      attrs = [];
      this.expect(openBrace);
      while (!this.consume(closeBrace)) {
        this.expect("let");
        const name = this.expect("NAME").val;
        const cls = this.parseTypeTemplate();
        this.expect(";");
        attrs.push([name, cls]);
      }
    }
    return {
      "type": "ClassTemplate",
      "token": token,
      "isNative": isNative,
      "pattern": pattern,
      "attrs": attrs,
    };
  }
  parseFunctionTemplate() {
    const token = this.peek();
    const isStatic = !!this.consume("static");
    if (!isStatic) {
      this.expect("fn");
    }
    const isNative = !!this.consume("native");
    const isAsync = !!this.consume("async");
    if (isAsync && (isNative || isStatic)) {
      throw new CompileError(
          "async functions can't be native or static", [token]);
    }
    const name = isStatic ?
        "staticBlock__" + this.getNextStaticBlockId() :
        this.expect("NAME").val;
    this._funcname = name;
    const args = isStatic ? [] : this.parseArgumentsTemplate();
    const ret = isStatic ?
        new TypenameTemplate(token, "Void") : this.parseTypeTemplate();
    let body = null;
    const oldInsideAsync = this._insideAsync;
    this._insideAsync = isAsync;
    if (isNative) {
      body = this.expect("STRING").val;
    } else {
      body = this.parseBlockTemplate();
    }
    this._insideAsync = oldInsideAsync;
    this._funcname = null;
    return {
      "type": "FunctionTemplate",
      "token": token,
      "isStatic": isStatic,
      "isNative": isNative,
      "isAsync": isAsync,
      "name": name,
      "args": args,
      "vararg": isStatic ? null : args.vararg,
      "ret": ret,
      "body": body,
    };
  }
  parseArgumentsTemplate() {
    this.expect(openParen);
    const args = [];
    args.vararg = null;
    while (!this.consume(closeParen)) {
      if (this.consume("...")) {
        const name = this.at("NAME") ? this.expect("NAME").val : null;
        const cls = this.expect("TYPENAME").val;
        args.vararg = [name, cls];
        this.expect(closeParen);
        break;
      }
      const name = this.at("NAME") ? this.expect("NAME").val : null;
      const cls = this.parseTypeTemplate();
      args.push([name, cls]);
      if (!this.at(closeParen)) {
        this.expect(",");
      }
    }
    return args;
  }
  parseTypeTemplate() {
    const token = this.peek();
    if (this.consume("$")) {
      return new VariableTypeTemplate(token, this.expect("TYPENAME").val);
    }
    if (this.consume(":")) {
      return new SymbolTypeTemplate(token, this.expect("TYPENAME").val);
    }
    const name = this.expect("TYPENAME").val;
    if (this.consume(openBracket)) {
      const args = [];
      let vararg = null;
      while (!this.consume(closeBracket)) {
        if (this.consume("...")) {
          vararg = this.expect("TYPENAME").val;
          this.expect(closeBracket);
          break;
        }
        args.push(this.parseTypeTemplate());
        if (!this.at(closeBracket)) {
          this.expect(",");
        }
      }
      return new TemplateTypeTemplate(token, name, args, vararg);
    } else {
      return new TypenameTemplate(token, name);
    }
  }
  parseBlockTemplate() {
    const token = this.expect(openBrace);
    const stmts = [];
    while (!this.consume(closeBrace)) {
      stmts.push(this.parseStatementTemplate());
    }
    return {
      "type": "BlockTemplate",
      "token": token,
      "stmts": stmts,
    };
  }
  parseStatementTemplate() {
    const token = this.peek();
    if (this.at(openBrace)) {
      return this.parseBlockTemplate();
    } else if (this.at("let") || this.at("final")) {
      const isFinal = !!this.consume("final");
      if (!isFinal) {
        this.expect("let");
      }
      const name = this.expect("NAME").val;
      const cls = this.at("=") ? null : this.parseTypeTemplate();
      const val = this.consume("=") ? this.parseExpressionTemplate() : null;
      this.expect(";");
      return {
        "type": "DeclarationTemplate",
        "token": token,
        "isFinal": isFinal,
        "name": name,
        "cls": cls,
        "val": val,
      };
    } else if (this.consume("return")) {
      const expr = this.at(";") ? null : this.parseExpressionTemplate();
      this.expect(";");
      return {
        "type": "ReturnTemplate",
        "token": token,
        "expr": expr,
      };
    } else if (this.consume("for")) {
      this.expect(openParen);
      const init = this.parseStatementTemplate();
      const cond = this.parseExpressionTemplate();
      this.expect(";");
      const incr = this.parseExpressionTemplate();
      this.expect(closeParen);
      const body = this.parseBlockTemplate();
      return {
        "type": "ForTemplate",
        "token": token,
        "init": init,
        "cond": cond,
        "incr": incr,
        "body": body,
      };
    } else if (this.consume("while")) {
      this.expect(openParen);
      const cond = this.parseExpressionTemplate();
      this.expect(closeParen);
      const body = this.parseBlockTemplate();
      return {
        "type": "WhileTemplate",
        "token": token,
        "cond": cond,
        "body": body,
      };
    } else if (this.consume("break")) {
      this.expect(";");
      return {
        "type": "BreakTemplate",
        "token": token,
      };
    } else if (this.consume("continue")) {
      this.expect(";");
      return {
        "type": "ContinueTemplate",
        "token": token,
      };
    } else if (this.consume("if")) {
      this.expect(openParen);
      const cond = this.parseExpressionTemplate();
      this.expect(closeParen);
      const body = this.parseBlockTemplate();
      let other = null;
      if (this.consume("else")) {
        if (this.at("if")) {
          other = this.parseStatementTemplate();
        } else {
          other = this.parseBlockTemplate();
        }
      }
      return {
        "type": "IfTemplate",
        "token": token,
        "cond": cond,
        "body": body,
        "other": other,
      };
    } else {
      const expr = this.parseExpressionTemplate();
      this.expect(";");
      return {
        "type": "ExpressionStatementTemplate",
        "token": token,
        "expr": expr,
      };
    }
  }
  parseExpressionListTemplate(open, close) {
    this.expect(open);
    const exprs = [];
    exprs.varexpr = null;
    while (!this.consume(close)) {
      if (this.consume("...")) {
        if (this.at("NAME")) {
          exprs.varexpr = ["NAME", this.expect("NAME").val];
        } else {
          exprs.varexpr = ["TYPENAME", this.expect("TYPENAME").val];
        }
        this.expect(close);
        break;
      }
      exprs.push(this.parseExpressionTemplate());
      if (!this.at(close)) {
        this.expect(",");
      }
    }
    return exprs;
  }
  parseExpressionTemplate() {
    return this.parseOrExpressionTemplate();
  }
  parseOrExpressionTemplate() {
    let expr = this.parseAndExpressionTemplate();
    while (true) {
      const token = this.peek();
      if (this.consume("||")) {
        expr = {
          "type": "LogicalBinaryOperationTemplate",
          "token": token,
          "op": "||",
          "left": expr,
          "right": this.parseAndExpressionTemplate(),
        };
        continue;
      }
      break;
    }
    return expr;
  }
  parseAndExpressionTemplate() {
    let expr = this.parseRelationalTemplate();
    while (true) {
      const token = this.peek();
      if (this.consume("&&")) {
        expr = {
          "type": "LogicalBinaryOperationTemplate",
          "token": token,
          "op": "&&",
          "left": expr,
          "right": this.parseRelationalTemplate(),
        };
        continue;
      }
      break;
    }
    return expr;
  }
  parseRelationalTemplate() {
    const expr = this.parseAdditiveTemplate();
    // NOTE: I don't want relational operators to be "chained" like
    // addition. It's kind of a weird thing to do. If you really need it,
    // use parenthesis.
    const token = this.peek();
    if (this.consume("==")) {
      const rhs = this.parseAdditiveTemplate();
      return makeFunctionCallTemplate(token, "__eq__", [expr, rhs]);
    }
    if (this.consume("!=")) {
      const rhs = this.parseAdditiveTemplate();
      return makeFunctionCallTemplate(token, "__ne__", [expr, rhs]);
    }
    if (this.consume("<")) {
      const rhs = this.parseAdditiveTemplate();
      return makeFunctionCallTemplate(token, "__lt__", [expr, rhs]);
    }
    if (this.consume("<=")) {
      const rhs = this.parseAdditiveTemplate();
      return makeFunctionCallTemplate(token, "__le__", [expr, rhs]);
    }
    if (this.consume(">")) {
      const rhs = this.parseAdditiveTemplate();
      return makeFunctionCallTemplate(token, "__gt__", [expr, rhs]);
    }
    if (this.consume(">=")) {
      const rhs = this.parseAdditiveTemplate();
      return makeFunctionCallTemplate(token, "__ge__", [expr, rhs]);
    }
    if (this.consume("in")) {
      const rhs = this.parseAdditiveTemplate();
      return makeFunctionCallTemplate(token, "__contains__", [rhs, expr]);
    }
    if (this.consume("not")) {
      this.expect("in");
      const rhs = this.parseAdditiveTemplate();
      return makeFunctionCallTemplate(token, "__notContains__", [rhs, expr]);
    }
    if (this.consume("is")) {
      if (this.consume("not")) {
        if (this.consume("null")) {
          return makeFunctionCallTemplate(token, "__isnotnull__", [expr]);
        } else {
          const rhs = this.parseAdditiveTemplate();
          return makeFunctionCallTemplate(token, "__isnot__", [expr, rhs]);
        }
      } else if (this.consume("null")) {
        return makeFunctionCallTemplate(token, "__isnull__", [expr]);
      } else {
        const rhs = this.parseAdditiveTemplate();
        return makeFunctionCallTemplate(token, "__is__", [expr, rhs]);
      }
    }
    return expr;
  }
  parseAdditiveTemplate() {
    let expr = this.parseMultiplicativeTemplate();
    while (true) {
      const token = this.peek();
      if (this.consume("+")) {
        expr = makeFunctionCallTemplate(
            token, "__add__", [expr, this.parseMultiplicativeTemplate()]);
        continue;
      }
      if (this.consume("-")) {
        expr = makeFunctionCallTemplate(
            token, "__sub__", [expr, this.parseMultiplicativeTemplate()]);
        continue;
      }
      break;
    }
    return expr;
  }
  parseMultiplicativeTemplate() {
    let expr = this.parsePrefixTemplate();
    while (true) {
      const token = this.peek();
      if (this.consume("*")) {
        expr = makeFunctionCallTemplate(
            token, "__mul__", [expr, this.parsePrefixTemplate()]);
        continue;
      }
      if (this.consume("/")) {
        expr = makeFunctionCallTemplate(
            token, "__div__", [expr, this.parsePrefixTemplate()]);
        continue;
      }
      if (this.consume("%")) {
        expr = makeFunctionCallTemplate(
            token, "__mod__", [expr, this.parsePrefixTemplate()]);
        continue;
      }
      break;
    }
    return expr;
  }
  parsePrefixTemplate() {
    const token = this.peek();
    if (this.consume("!")) {
      return makeFunctionCallTemplate(token, "__not__", [
        this.parsePrefixTemplate(),
      ]);
    }
    if (this.consume("-")) {
      return makeFunctionCallTemplate(token, "__neg__", [
        this.parsePrefixTemplate(),
      ]);
    }
    if (this.consume("+")) {
      return makeFunctionCallTemplate(token, "__pos__", [
        this.parsePrefixTemplate(),
      ]);
    }
    return this.parsePostfixTemplate();
  }
  parsePostfixTemplate() {
    let expr = this.parsePrimaryTemplate();
    while (true) {
      const token = this.peek();
      if (this.consume(openBracket)) {
        const arg = this.parseExpressionTemplate();
        this.expect(closeBracket);
        if (this.consume("=")) {
          const val = this.parseExpressionTemplate();
          expr = makeFunctionCallTemplate(
              token, "__setitem__", [expr, arg, val]);
        } else {
          expr = makeFunctionCallTemplate(token, "__getitem__", [expr, arg]);
        }
        continue;
      }
      if (this.consume(".")) {
        const name = this.expect("NAME").val;
        if (this.consume("=")) {
          const val = this.parseExpressionTemplate();
          expr = {
            "type": "SetAttributeTemplate",
            "token": token,
            "owner": expr,
            "name": name,
            "val": val,
          };
        } else if (augmentAssignOperands.some(op => this.at(op))) {
          const op = this.next().val;
          const rhs = this.parseExpressionTemplate();
          expr = {
            "type": "AugmentAttributeTemplate",
            "token": token,
            "owner": expr,
            "name": name,
            "op": op,
            "val": rhs,
          };
        } else if (this.at(openParen)) {
          const args =
              this.parseExpressionListTemplate(openParen, closeParen);
          args.unshift(expr);
          args.unshift({
            "type": "TypeExpressionTemplate",
            "token": token,
            "cls": new SymbolTypeTemplate(token, "Method"),
          });
          expr =
              makeFunctionCallTemplate(token, name, args, args.varexpr);
        } else {
          expr = {
            "type": "GetAttributeTemplate",
            "token": token,
            "owner": expr,
            "name": name,
          };
        }
        continue;
      }
      break;
    }
    return expr;
  }
  parsePrimaryTemplate() {
    const token = this.peek();
    if (this.consume("true") || this.consume("false")) {
      return {
        "type": token.type,
        "token": token,
        "exprType": new Typename("Bool"),
      };
    } else if (this.consume("INT")) {
      return {
        "type": "Int",
        "token": token,
        "val": token.val,
        "exprType": new Typename("Int"),
      };
    } else if (this.consume("FLOAT")) {
      return {
        "type": "Float",
        "token": token,
        "val": token.val,
        "exprType": new Typename("Float"),
      };
    } else if (this.consume("STRING")) {
      return {
        "type": "String",
        "token": token,
        "val": token.val,
        "exprType": new Typename("String"),
      };
    } else if (this.consume("NAME")) {
      if (this.at(openParen)) {
        const args = this.parseExpressionListTemplate(openParen, closeParen);
        return makeFunctionCallTemplate(token, token.val, args, args.varexpr);
      } else if (this.consume("=")) {
        const val = this.parseExpressionTemplate();
        return {
          "type": "AssignTemplate",
          "token": token,
          "name": token.val,
          "val": val,
        };
      } else if (augmentAssignOperands.some(op => this.at(op))) {
        const op = this.next().type;
        const rhs = (op === "++" || op === "--") ?
                    null : this.parseExpressionTemplate();
        return {
          "type": "AugmentAssignTemplate",
          "token": token,
          "name": token.val,
          "op": op,
          "val": rhs,
        };
      } else {
        return {
          "type": "NameTemplate",
          "token": token,
          "name": token.val,
        };
      }
    } else if (this.consume("await")) {
      if (!this._insideAsync) {
        throw new CompileError(
            "You can't use await expressions outside of an async " +
            "function or lambda expression", [token]);
      }
      const expr = this.parseExpressionTemplate();
      return {
        "type": "AwaitTemplate",
        "token": token,
        "expr": expr,
      };
    } else if (this.at("$") || this.at(":") || this.at("TYPENAME")) {
      const cls = this.parseTypeTemplate();
      return {
        "type": "TypeExpressionTemplate",
        "token": token,
        "cls": cls,
      };
    } else if (this.consume("fn") || this.consume("async")) {
      const isAsync = token.type === "async";
      const args = this.parseArgumentsTemplate();
      const oldInsideAsync = this._insideAsync;
      this._insideAsync = isAsync;
      const body = this.parseBlockTemplate();
      this._insideAsync = oldInsideAsync;
      for (let i = 0; i < args.length; i++) {
        if (!args[i][0]) {
          throw new CompileError(
              "You can't have a Lambda with type arguments (" + i + ")",
              [token]);
        }
      }
      if (args.vararg && !args.vararg[0]) {
        throw new CompileError(
            "You can't have a Lambda with type arguments (vararg)",
            [token]);
      }
      return {
        "type": "LambdaTemplate",
        "token": token,
        "isAsync": isAsync,
        "args": args,
        "vararg": args.vararg,
        "body": body,
      };
    } else if (this.consume("#")) {
      const op = this.expect("NAME").val;
      switch(op) {
      case "error":{
        const message = this.expect("STRING").val;
        return {
          "type": "CompileTimeErrorTemplate",
          "token": token,
          "message": message,
        };
      }
      default:
        throw new CompileError(
            "Unrecognized compile time operation: " + op, [token]);
      }
    } else if (this.at(openBracket)) {
      const exprs = this.parseExpressionListTemplate(
          openBracket, closeBracket);
      return {
        "type": "ListDisplayTemplate",
        "token": token,
        "exprs": exprs,
        "varexpr": exprs.varexpr,
      };
    } else if (this.consume(openParen)) {
      const expr = this.parseExpressionTemplate();
      this.expect(closeParen);
      return expr;
    }
    throw new CompileError("Expected expression", [token]);
  }
}

function parseModule(uri, text) {
  return new Parser(uri, text).parseModule();
}

// ast

function makeFunctionCallTemplate(token, name, exprs, varexpr) {
  return {
    "type": "FunctionCallTemplate",
    "token": token,
    "name": name,
    "exprs": exprs,
    "varexpr": varexpr || null,
  };
}

{
  const result = parseModule("<test>", `
  fn main() Void {
    print("Hello world!");
    foo(5);
  }
  fn foo(bar $T) Baz {
    return makeBaz(bar);
  }
  fn native makeBaz(x Int) Baz """ return Object.create(null); """
  `);
}

// annotate

function serializeFunctionInstantiation(name, argtypes) {
  return name + "(" +
         argtypes.map(argtype => argtype.toString()).join(",") + ")";
}

function checkForDuplicateClassDefinitions(classtemps) {
  const refs = Object.create(null);
  for (const classtemp of classtemps) {
    const key = classtemp.pattern.serialize();
    if (refs[key]) {
      throw new CompileError(
          "Duplicate class definition: " + key,
          [refs[key].token, classtemp.token]);
    }
    refs[key] = classtemp;
  }
}

function checkForDuplicateFunctionDefinitions(functemps) {
  const refs = Object.create(null);
  for (const functemp of functemps) {
    const templ = new TemplateTypeTemplate(
        functemp.token,
        functemp.name,
        functemp.args.map(arg => arg[1]),
        functemp.vararg);
    const key = templ.serialize();
    if (refs[key]) {
      throw new CompileError(
          "Duplicate function definition: " + key,
          [refs[key].token, functemp.token]);
    }
    refs[key] = functemp;
  }
}

function annotate(modules) {
  // collect all the function templates.
  const functemps = [];
  const classtemps = [];
  const decltemps = [];
  for (const mod of modules) {
    if (mod.type !== "UnexpandedModule") {
      throw new CompileError("Expected Module: " + mod, []);
    }
    for (const functemp of mod.functemps) {
      functemps.push(functemp);
    }
    for (const classtemp of mod.classtemps) {
      classtemps.push(classtemp);
    }
    for (const decltemp of mod.decltemps) {
      decltemps.push(decltemp);
    }
  }

  checkForDuplicateClassDefinitions(classtemps);
  checkForDuplicateFunctionDefinitions(functemps);

  // expand functions as needed.
  const funcs = [];
  const clss = [];
  const decls = [];
  const instantiationTable = Object.create(null);
  const instantiationQueue = [];  // It's a LIFO queue, shouldn't matter
  const classInstantiationTable = Object.create(null);
  const classInstantiationQueue = [];  // It's a LIFO queue, shouldn't matter

  let currentInstantiationContext = null;

  let scope = Object.create(null);
  const scopeStack = [];

  function pushScope() {
    scopeStack.push(scope);
    scope = Object.create(scope);
  }

  function popScope() {
    scope = scopeStack.pop();
  }

  function getVariableType(name, stack) {
    if (!scope[name]) {
      throw new InstantiationError("No such variable " + name, stack);
    }
    return scope[name];
  }

  function declareVariable(name, type, frames) {
    if (Object.hasOwnProperty.apply(scope, [name])) {
      throw new InstantiationError(
          "Variable " + name + " already declared in scope", frames);
    }
    scope[name] = type;
  }

  function instantiateClass(cls) {
    const key = cls.toString();
    const classtemp = findMatchingClassTemplate(cls);
    if (classtemp === null) {
      throw new CompileError("No such class " + key, []);
    }
    const token = classtemp.token;
    const bindings = classtemp.pattern.bindType(cls);
    let attrs = null;
    if (!classtemp.isNative) {
      attrs = [];
      for (const [name, typeTemplate] of classtemp.attrs) {
        // NOTE: This causes the resulting type to get queued
        // for instantiation.
        attrs.push([name, resolveTypeTemplate(typeTemplate, bindings)]);
      }
    }
    return {
      "type": "Class",
      "token": token,
      "isNative": classtemp.isNative,
      "pattern": cls,
      "attrs": attrs,
    };
  }

  function instantiateFunction(name, argtypes, stack) {
    const functemp = findMatchingFunctionTemplate(name, argtypes);
    if (functemp === null) {
      throw new InstantiationError(
          "No such function: " +
          serializeFunctionInstantiation(name, argtypes),
          flatten(stack));
    }
    const token = functemp.token;
    currentInstantiationContext =
        serializeFunctionInstantiation(name, argtypes);
    const frame = new InstantiationFrame(token, currentInstantiationContext);
    const bindings = bindFunctionTemplateWithArgumentTypes(
        functemp, argtypes);
    const bodyret = resolveTypeTemplate(functemp.ret, bindings);
    const isAsync = functemp.isAsync;
    const ret = isAsync ? new TemplateType("Promise", [bodyret]) : bodyret;
    queueClassInstantiation(ret);
    const argnames = functemp.args.map(targ => targ[0]);
    const args = [];
    for (let i = 0; i < argnames.length; i++) {
      args.push([argnames[i], argtypes[i]]);
    }
    if (functemp.vararg) {
      const varargname = functemp.vararg[0];
      for (let i = argnames.length; i < argtypes.length; i++) {
        const j = i - argnames.length;
        args.push([varargname + "__" + j, argtypes[i]]);
      }
    }
    if (functemp.isNative) {
      currentInstantiationContext = null;
      return {
        "type": "Function",
        "token": token,
        "isStatic": functemp.isStatic,
        "isNative": functemp.isNative,
        "isAsync": isAsync,
        "name": functemp.name,
        "args": args,
        "ret": ret,
        "body": functemp.body,
      };
    }
    pushScope();
    for (let i = 0; i < argnames.length; i++) {
      const argname = argnames[i];
      if (argname !== null) {
        declareVariable(
            argnames[i], args[i][1], [frame].concat(flatten(stack)));
      }
    }
    if (functemp.vararg) {
      const varargname = functemp.vararg[0];
      const types = [];
      for (let i = argnames.length; i < argtypes.length; i++) {
        types.push(argtypes[i]);
      }
      declareVariable("..." + varargname, types,
                      [frame].concat(flatten(stack)));
    }

    const body = resolveStatement(functemp.body, bindings, stack);
    currentInstantiationContext = null;
    popScope();
    if (bodyret.equals(newTypename("Void"))) {
      if (body.maybeReturns !== null &&
          !body.maybeReturns.equals(newTypename("Void"))) {
        throw new InstantiationError(
            "Void function might return a value",
            [frame].concat(flatten(stack)));
      }
    } else {
      if (body.returns === null) {
        throw new InstantiationError(
            "Function might not return",
            [frame].concat(flatten(stack)));
      }
    }
    return {
      "type": "Function",
      "token": token,
      "isStatic": functemp.isStatic,
      "isNative": functemp.isNative,
      "isAsync": isAsync,
      "name": functemp.name,
      "args": args,
      "ret": ret,
      "body": body,
    };
  }

  function flatten(stack, result) {
    result = result || [];
    if (stack === null) {
      return result;
    } else {
      result.push(stack[0]);
      flatten(stack[1], result);
      return result;
    }
  }

  function resolveStatement(node, bindings, stack) {
    switch(node.type) {
    case "BlockTemplate":
      pushScope();
      const stmts = node.stmts.map(stmt =>
          resolveStatement(stmt, bindings, stack));
      popScope();
      let ret = null;
      let mret = null;
      for (const stmt of stmts) {
        const frame = new InstantiationFrame(
            stmt.token, currentInstantiationContext);
        if (ret !== null) {
          throw new InstantiationError(
              "Unreachable statement",
              [frame].concat(flatten(stack)));
        }
        if (stmt.returns !== null) {
          if (mret !== null && !stmt.returns.equals(mret)) {
            throw new InstantiationError(
                "Mismatch return types: " + mret.toString() + " and " +
                stmt.returns.toString(),
                [frame].concat(flatten(stack)));
          }
          mret = ret = stmt.returns;
        }
        if (stmt.maybeReturns !== null) {
          if (mret === null) {
            mret = stmt.maybeReturns;
          } else if (!stmt.maybeReturns.equals(mret)) {
            throw new InstantiationError(
                "Mismatch return types: " + mret.toString() + " and " +
                stmt.maybeReturns.toString(),
                [frame].concat(flatten(stack)));
          }
        }
      }
      return {
        "type": "Block",
        "token": node.token,
        "stmts": stmts,
        "returns": ret,
        "maybeReturns": mret,
      };
    case "DeclarationTemplate":
      const val = node.val === null ?
          null : resolveExpression(node.val, bindings, stack);
      const cls = node.cls === null ?
          val.exprType : resolveTypeTemplate(node.cls, bindings);
      const frame = new InstantiationFrame(
          node.token, currentInstantiationContext);
      if (val !== null && !val.exprType.equals(cls)) {
        throw new InstantiationError(
            "Expected " + cls.toString() + " but got an expression of " +
            "type " + val.toString(), [frame].concat(flatten(stack)));
      }
      declareVariable(node.name, cls, [frame].concat(flatten(stack)));
      return {
        "type": "Declaration",
        "token": node.token,
        "isFinal": node.isFinal,
        "name": node.name,
        "cls": cls,
        "val": val,
        "returns": null,
        "maybeReturns": null,
      };
    case "ExpressionStatementTemplate":
      return {
        "type": "ExpressionStatement",
        "token": node.token,
        "expr": resolveExpression(node.expr, bindings, stack),
        "returns": null,
        "maybeReturns": null,
      };
    case "ReturnTemplate":
      const expr = node.expr === null ?
          null : resolveExpression(node.expr, bindings, stack);
      const rettype = expr === null ? newTypename("Void") : expr.exprType;
      return {
        "type": "Return",
        "token": node.token,
        "expr": expr,
        "returns": rettype,
        "maybeReturns": rettype,
      };
    case "ForTemplate": {
      pushScope();
      const init = resolveStatement(node.init, bindings, stack);
      const cond = resolveExpression(node.cond, bindings, stack);
      const frame = new InstantiationFrame(
          node.token, currentInstantiationContext);
      if (!cond.exprType.equals(newTypename("Bool"))) {
        throw new InstantiationError(
            "For loop condition must return a bool but got " +
            cond.exprType.toString(), [frame].concat(flatten(stack)));
      }
      const incr = resolveExpression(node.incr, bindings, stack);
      const body = resolveStatement(node.body, bindings, stack);
      popScope();
      return {
        "type": "For",
        "token": node.token,
        "init": init,
        "cond": cond,
        "incr": incr,
        "body": body,
        "returns": null,
        "maybeReturns": body.maybeReturns,
      };
    }
    case "WhileTemplate": {
      const cond = resolveExpression(node.cond, bindings, stack);
      const frame = new InstantiationFrame(
          node.token, currentInstantiationContext);
      if (!cond.exprType.equals(newTypename("Bool"))) {
        throw new InstantiationError(
            "While loop condition must return a bool but got " +
            cond.exprType.toString(), [frame].concat(flatten(stack)));
      }
      const body = resolveStatement(node.body, bindings, stack);
      return {
        "type": "While",
        "token": node.token,
        "cond": cond,
        "body": body,
        "returns": null,
        "maybeReturns": body.maybeReturns,
      };
    }
    case "BreakTemplate":
      return {
        "type": "Break",
        "token": node.token,
        "returns": null,
        "maybeReturns": null,
      };
    case "ContinueTemplate":
      return {
        "type": "Continue",
        "token": node.token,
        "returns": null,
        "maybeReturns": null,
      };
    case "IfTemplate": {
      const cond = resolveExpression(node.cond, bindings, stack);
      const frame = new InstantiationFrame(
          node.token, currentInstantiationContext);
      if (!cond.exprType.equals(newTypename("Bool"))) {
        throw new InstantiationError(
            "For loop condition must return a bool but got " +
            cond.exprType.toString(), [frame].concat(flatten(stack)));
      }
      const body = resolveStatement(node.body, bindings, stack);
      const other = node.other === null ?
          null : resolveStatement(node.other, bindings, stack);
      if (other !== null && other.maybeReturns !== null &&
          body.maybeReturns !== null &&
          !body.maybeReturns.equals(other.maybeReturns)) {
        throw new InstantiationError(
            "Return type mismatch", [frame].concat(flatten(stack)));
      }
      let returns = null;
      if (other !== null && other.returns !== null &&
          body.returns !== null) {
        returns = body.returns;
      }
      let maybeReturns = null;
      if (other !== null && other.maybeReturns !== null) {
        maybeReturns = other.maybeReturns;
      }
      if (body.maybeReturns !== null) {
        maybeReturns = body.maybeReturns;
      }
      return {
        "type": "If",
        "token": node.token,
        "cond": cond,
        "body": body,
        "other": other,
        "returns": returns,
        "maybeReturns": maybeReturns,
      };
    }
    default:
      throw new CompileError(
          "Unrecognized statement template: " + node.type,
          [node.token]);
    }
  }

  function resolveExpression(node, bindings, stack) {
    const result = resolveValueOrTypeExpression(node, bindings, stack);
    const frame = new InstantiationFrame(
        node.token, currentInstantiationContext);
    if (result.type === "TypeExpression") {
      throw new InstantiationError(
          "Expected expression but got type expression",
          [frame].concat(flatten(stack)));
    }
    return result;
  }

  function resolveExpressionList(node, bindings, stack) {
    const exprs = node.exprs;
    const varexpr = node.varexpr;
    const token = node.token;
    const result = [];
    for (const expr of exprs) {
      result.push(resolveValueOrTypeExpression(expr, bindings, stack));
    }
    if (varexpr !== null) {
      const [kind, name] = varexpr;
      switch(kind) {
      case "NAME": {
        const types = getVariableType("..." + name);
        for (let i = 0; i < types.length; i++) {
          result.push({
            "type": "Name",
            "token": token,
            "name": name + "__" + i,
            "exprType": types[i],
          });
        }
        break;
      }
      case "TYPENAME": {
        const types = bindings["..." + name];
        if (!types) {
          throw new InstantiationError(
              "No such varexpr type: ..." + name,
              flatten(stack));
        }
        for (const type of types) {
          result.push({
            "type": "TypeExpression",
            "token": token,
            "exprType": type,
          });
        }
        break;
      }
      default:
        throw new InstantiationError(
            "Unrecognized varexpr kind: " + kind,
            flatten(stack));
      }
    }
    return result;
  }

  function resolveValueOrTypeExpression(node, bindings, stack) {
    const frame =
        new InstantiationFrame(node.token, currentInstantiationContext);
    switch(node.type) {
    case "FunctionCallTemplate":
      const name = node.name;
      const args = resolveExpressionList(node, bindings, stack);
      const argtypes = args.map(arg => arg.exprType);
      const rettype = getFunctionReturnType(
          name, argtypes, [frame].concat(flatten(stack)));
      queueFunctionInstantiation(name, argtypes, [frame, stack]);
      // TODO: Figure out if I want type expression arguments to
      // fundamentally have different type signatures from runtime
      // expression arguments.
      // NOTE: This functemp should not be null since if it were,
      // "rettype = getFunctionReturnType(...)" should've thrown

      // TODO: Use a more reobust way to test whether an expression
      // is a type expression than just checking if it is the
      // "TypeExpression" node.

      // NOTE: We check that we don't use type expressions when we
      // expect a value, but we don't check vice versa.
      // Somteimes we want to use a value expression to represent
      // the type we want to pass.

      const functemp = findMatchingFunctionTemplate(name, argtypes);
      for (let i = 0; i < functemp.args.length; i++) {
        if (args[i].type === "TypeExpression") {
          if (functemp.args[i][0] !== null) {
            throw new InstantiationError(
                "Expected value expression but got type expression: " +
                "argumentIndex = " + i +
                functemp.token.getLocationMessage(),
                [frame].concat(flatten(stack)));
          }
        }
      }

      if (functemp.vararg) {
        // Here we check that if the vararg argument signature indicates
        // a value expression, we make sure that we get a type expression.
        const [name, type] = functemp.vararg;
        if (name) {
          for (let i = functemp.args.length; i < args.length; i++) {
            if (args[i].type === "TypeExpression") {
              throw new InstantiationError(
                  "Expected value expressions for vararg part, but got " +
                  "type expression: argumentIndex = " + i +
                  functemp.token.getLocationMessage(),
                  [frame].concat(flatten(stack)));
            }
          }
        }
      }
      return {
        "type": "FunctionCall",
        "token": node.token,
        "name": name,
        "args": args,
        "exprType": rettype,
      };
    case "NameTemplate":
      return {
        "type": "Name",
        "token": node.token,
        "name": node.name,
        "exprType": getVariableType(
            node.name, [frame].concat(flatten(stack))),
      };
    case "true":
    case "false":
    case "Int":
    case "Float":
    case "String":
      queueClassInstantiation(node.exprType);
      return node;
    case "GetAttributeTemplate": {
      const owner = resolveExpression(node.owner, bindings, stack);
      return {
        "type": "GetAttribute",
        "token": node.token,
        "owner": owner,
        "name": node.name,
        "exprType": getAttributeType(owner.exprType, node.name, stack),
      };
    }
    case "SetAttributeTemplate": {
      const owner = resolveExpression(node.owner, bindings, stack);
      const val = resolveExpression(node.val, bindings, stack);
      const exprType = getAttributeType(owner.exprType, node.name, stack);
      if (!exprType.equals(val.exprType)) {
        throw new InstantiationError(
            owner.exprType + "." + node.name + " is type " + exprType +
            " but expression is of type " + val.exprType,
            [frame].flatten(stack));
      }
      return {
        "type": "SetAttribute",
        "token": node.token,
        "owner": owner,
        "name": node.name,
        "val": val,
        "exprType": exprType,
      };
    }
    case "TypeExpressionTemplate":
      const cls = resolveTypeTemplate(node.cls, bindings);
      return {
        "type": "TypeExpression",
        "token": node.token,
        "exprType": cls,
      };
    case "CompileTimeErrorTemplate":
      throw new InstantiationError(
          node.message, [frame].concat(flatten(stack)));
    case "ListDisplayTemplate": {
      const exprs = resolveExpressionList(node, bindings, stack);
      if (exprs.length === 0) {
        throw new InstantiationError(
          "List displays must contain at least one element to allow for " +
          "type inference -- try e.g. new(List[Int]) instead",
          [frame].concat(flatten(stack)));
      }
      for (const expr of exprs) {
        if (!expr.exprType.equals(exprs[0].exprType)) {
          const frame = new InstantiationFrame(
              expr.token, currentInstantiationContext);
          throw new InstantiationError(
            "Expected " + exprs[0].exprType.toString() + " but got " +
            expr.exprType.toString(), [frame].concat(flatten(stack)));
        }
        if (expr.type === "TypeExpression") {
          throw new InstantiationError(
              "Expected expression but got type expression",
              [frame].concat(flatten(stack)));
        }
      }
      const exprType = new TemplateType("List", [exprs[0].exprType]);
      queueClassInstantiation(exprType);
      return {
        "type": "ListDisplay",
        "token": node.token,
        "exprs": exprs,
        "exprType": exprType,
      };
    }
    case "AssignTemplate":
      const val = resolveExpression(node.val, bindings, stack);
      const exprType = getVariableType(
          node.name, [frame].concat(flatten(stack)));
      if (!val.exprType.equals(exprType)) {
        throw new InstantiationError(
            "Variable is type " + exprType.toString() + " but " +
            "expression is of type " + val.exprType.toString(),
            [frame].concat(flatten(stack)));
      }
      return {
        "type": "Assign",
        "token": node.token,
        "name": node.name,
        "val": val,
        "exprType": exprType,
      };
    case "AugmentAssignTemplate": {
      const exprType = getVariableType(node.name, stack);
      if (!(exprType instanceof Typename) ||
          (exprType.name !== "Int" && exprType.name !== "Float" &&
           exprType.name !== "String")) {
        throw new InstantiationError(
            "Augassign operations can only be done on int or float " +
            "variables: " + exprType.toString(),
            [frame].concat(flatten(stack)));
      }
      if (exprType.name === "String" && node.op !== "+=") {
        throw new InstantiationError(
            "Only the += augassign operation can be used on String types",
            [frame].concat(flatten(stack)));
      }
      if ((node.op === "++" || node.op === "--") && exprType.name !== "Int") {
        throw new InstantiationError(
            "++ and -- operators can only be used on Int types " +
            "but found: " + exprType.name,
            [frame].concat(flatten(stack)));
      }
      const val = node.val === null ?
                  null : resolveExpression(node.val, bindings, stack);
      if (val !== null && !val.exprType.equals(exprType)) {
        throw new InstantiationError(
            "Expected " + exprType.toString() + " but got " +
            val.exprType.toString(), [frame].concat(flatten(stack)));
      }
      return {
        "type": "AugmentAssign",
        "token": node.token,
        "name": node.name,
        "op": node.op,
        "val": val,
        "exprType": exprType,
      };
    }
    case "LogicalBinaryOperationTemplate": {
      const left = resolveExpression(node.left, bindings, stack);
      const right = resolveExpression(node.right, bindings, stack);
      const frames = [frame].concat(flatten(stack));
      if (!left.exprType.equals(newTypename("Bool"))) {
        throw new InstantiationError(
            "Or (left) operand must be Bool but got " + left.exprType,
            frames);
      }
      if (!right.exprType.equals(newTypename("Bool"))) {
        throw new InstantiationError(
            "Or (right) operand must be Bool but got " + right.exprType,
            frames);
      }
      return {
        "type": "LogicalBinaryOperation",
        "token": node.token,
        "op": node.op,
        "left": left,
        "right": right,
        "exprType": newTypename("Bool"),
      };
    }
    case "AwaitTemplate": {
      const expr = resolveExpression(node.expr, bindings, stack);
      if (!(expr.exprType instanceof TemplateType) ||
          expr.exprType.name !== "Promise" ||
          expr.exprType.args.length !== 1) {
        throw new InstantiationError(
            "You can only await on an object of type Promise[$T], " +
            "but got: " + expr.exprType,
          [frame].concat(flatten(stack)));
      }
      const exprType = expr.exprType.args[0];
      return {
        "type":  "Await",
        "token": node.token,
        "expr": expr,
        "exprType": exprType,
      };
    }
    case "LambdaTemplate": {
      const args = [];
      pushScope();
      for (const [argname, argtypetemp] of node.args) {
        const argtype = resolveTypeTemplate(argtypetemp, bindings);
        args.push([argname, argtype]);
        declareVariable(argname, argtype, [frame].concat(flatten(stack)));
      }
      if (node.vararg) {
        const [name, typename] = node.vararg;
        if (!bindings["..." + typename]) {
          throw new InstantiationError(
              "Tried to use vararg type ..." + typename + " in Lambda " +
              "argument list, but there is no such vararg type",
              [frame].concat(flatten(stack)));
        }
        const types = bindings["..." + typename];
        for (let i = 0; i < types.length; i++) {
          const key = name + "__" + i;
          args.push([key, types[i]]);
          declareVariable(key, types[i],
                          [frame].concat(flatten(stack)));
        }
        declareVariable("..." + name, types, [frame].concat(flatten(stack)));
      }
      const argtypes = args.map(arg => arg[1]);
      const body = resolveStatement(node.body, bindings, stack);
      if (body.maybeReturns !== null && body.returns === null) {
        throw new InstantiationError(
            "Invalid return types: " + body.maybeReturns + " / " +
            body.returns, [frame].concat(flatten(stack)));
      }
      if (body.returns === null) {
        body.returns = newTypename("Void");
      }
      popScope();
      const bodyret = node.isAsync ?
                      new TemplateType("Promise", [body.returns]) :
                      body.returns;
      const exprType = new TemplateType("Lambda", [bodyret].concat(argtypes));
      queueClassInstantiation(exprType);
      return {
        "type": "Lambda",
        "token": node.token,
        "isAsync": node.isAsync,
        "args": args,
        "body": body,
        "exprType": exprType,
      };
    }
    default:
      throw new InstantiationError(
          "Unrecognized expression template: " + node.type, [frame]);
    }
  }

  function getFunctionReturnType(name, argtypes, frames) {
    const functemp = findMatchingFunctionTemplate(name, argtypes);
    if (functemp === null) {
      throw new InstantiationError(
          "No such function: " +
          serializeFunctionInstantiation(name, argtypes),
          frames);
    }
    const bindings = bindFunctionTemplateWithArgumentTypes(
        functemp, argtypes);
    const ret = functemp.isAsync ?
        new TemplateTypeTemplate(functemp.token, "Promise", [functemp.ret]):
        functemp.ret;
    return resolveTypeTemplate(ret, bindings);
  }

  function getAttributeType(type, name, stack) {
    for (const [n, t] of instantiateClass(type).attrs) {
      if (name === n) {
        return t;
      }
    }
    throw new InstantiationError(
        "No such attribute: " + type + "." + name, flatten(stack));
  }

  function resolveTypeTemplate(typeTemplate, bindings) {
    const type = typeTemplate.resolve(bindings);
    queueClassInstantiation(type);
    return type;
  }

  const matchingFunctionTemplateCache = Object.create(null);
  function findMatchingFunctionTemplate(name, argtypes) {
    const key = serializeFunctionInstantiation(name, argtypes);
    if (matchingFunctionTemplateCache[key] === undefined) {
      let bestSoFar = null;
      for (const functemp of functemps) {
        if (functemp.name !== name) {
          continue;
        }
        const bindings = bindFunctionTemplateWithArgumentTypes(
            functemp, argtypes);
        if (bindings === null) {
          continue;
        }
        if (bestSoFar !== null &&
            !isMoreSpecializedFunctionTemplate(functemp, bestSoFar)) {
          continue;
        }
        bestSoFar = functemp;
      }
      matchingFunctionTemplateCache[key] = bestSoFar;
    }
    return matchingFunctionTemplateCache[key];
  }

  const matchingClassTemplateCache = Object.create(null);
  function findMatchingClassTemplate(cls) {
    const key = cls.toString();
    if (matchingClassTemplateCache[key] === undefined) {
      let bestSoFar = null;
      for (const classtemp of classtemps) {
        const bindings = classtemp.pattern.bindType(cls);
        if (bindings === null) {
          continue;
        }
        if (bestSoFar !== null &&
            classtemp.pattern.compareSpecialization(bestSoFar.pattern) < 0) {
          continue;
        }
        bestSoFar = classtemp;
      }
      matchingClassTemplateCache[key] = bestSoFar;
    }
    return matchingClassTemplateCache[key];
  }

  function isMoreSpecializedFunctionTemplate(left, right) {
    // returns true if the 'left' function template is more specialized
    // than the right one.
    const lefttemp = typeTemplateFromFunctionTemplate(left);
    const righttemp = typeTemplateFromFunctionTemplate(right);
    return lefttemp.compareSpecialization(righttemp) > 0;
  }

  function typeTemplateFromFunctionTemplate(functemp) {
    const argtypes = functemp.args.map(arg => arg[1]);
    const vararg = functemp.vararg ? functemp.vararg[1] : null;
    return new TemplateTypeTemplate(functemp.token, "Args", argtypes, vararg);
  }

  function bindFunctionTemplateWithArgumentTypes(functemp, argtypes) {
    const typeTemplate = typeTemplateFromFunctionTemplate(functemp);
    return typeTemplate.bindType(new TemplateType("Args", argtypes));
  }

  function queueFunctionInstantiation(name, argtypes, stack) {
    const key = serializeFunctionInstantiation(name, argtypes);
    if (!instantiationTable[key]) {
      instantiationTable[key] = true;
      instantiationQueue.push([name, argtypes, stack]);
    }
  }

  function queueClassInstantiation(cls) {
    if (cls instanceof SymbolType) {
      return;
    }
    const key = cls.toString();
    if (!classInstantiationTable[key]) {
      classInstantiationTable[key] = true;
      classInstantiationQueue.push(cls);

      // With template types, we also want to check all child
      // types have been instantiated.
      if (cls instanceof TemplateType) {
        for (const child of cls.args) {
          queueClassInstantiation(child);
        }
      }
    }
  }

  function newTypename(name) {
    const type = new Typename(name);
    queueClassInstantiation(type);
    return type;
  }

  // Queue all static blocks for instantiation
  for (const decltemp of decltemps) {
    decls.push(resolveStatement(decltemp, Object.create(null), null));
  }
  for (const functemp of functemps) {
    if (functemp.isStatic) {
      instantiationQueue.push([functemp.name, [], null]);
    }
  }
  // Queue main for instantiation
  instantiationQueue.push(["main", [], null]);

  while (true) {
    if (instantiationQueue.length > 0) {
      const [name, argtypes, stack] = instantiationQueue.shift();
      funcs.push(instantiateFunction(name, argtypes, stack));
      continue;
    }
    if (classInstantiationQueue.length > 0) {
      const cls = classInstantiationQueue.shift();
      clss.push(instantiateClass(cls));
      continue;
    }
    break;
  }

  return {
    "type": "Program",
    "funcs": funcs,
    "clss": clss,
    "decls": decls,
  };
}

{
  const result = parseModule("<test>", `
  fn main() Void {
    print("Hello world!");
    foo(5);
  }
  fn foo(bar $T) Baz {
    return makeBaz(bar);
  }

  fn native makeBaz(x Int) Baz """
    return Object.create(null);
  """

  fn native print(t $T) Void """
    console.log(var_t);
  """

  class native Baz;
  class native Void;
  class native String;
  class native Int;
  class Baz2 [$T] {
    let t $T;
  }
  `);
  const ast = annotate([result]);
}

function parseAndAnnotate(uriTextPairs) {
  const mods = [];
  for (const [uri, text] of uriTextPairs) {
    mods.push(parseModule(uri, text));
  }
  return annotate(mods);
}

exports.CompileError = CompileError;
exports.parseAndAnnotate = parseAndAnnotate;
exports.serializeFunctionInstantiation = serializeFunctionInstantiation;
exports.Typename = Typename;
exports.TemplateType = TemplateType;

})(tt);
module.exports = tt;

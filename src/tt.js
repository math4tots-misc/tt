// jshint esversion: 6
// For browser, use with browserify
const tt = Object.create(null);
(function(exports) {
"use strict";

// TODO: mark some functions as constexpr -- that is functions that
// can be evaluated at compile time for use in compile time debugging
// and operations. And also implement those for compile time evaluation.

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

class TemplateType extends Type {
  constructor(name, args) {
    super();
    this.name = name;
    this.args = args;
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
    const len = args.length;
    if (len !== oargs.length) {
      // We don't *really* care if the lengths aren't the same.
      // Just to be consistent about the ordering, let's say that
      // longer means more specialized.
      return len < oargs.length ? -1 : 1;
    }
    boundVars = Object.create(boundVars);
    otherBoundVars = Object.create(otherBoundVars);
    for (let i = 0; i < len; i++) {
      const result = args[i].compareSpecialization(
          oargs[i], boundVars, otherBoundVars);
      if (result !== 0) {
        return result;
      }
      for (const freeVar of args[i].getFreeVars(boundVars)) {
        boundVars[freeVar] = true;
      }
      for (const freeVar of oargs[i].getFreeVars(otherBoundVars)) {
        otherBoundVars[freeVar] = true;
      }
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
}

class TemplateTypeTemplate extends TypeTemplate {
  constructor(token, name, args) {
    super(token);
    this.name = name;
    this.args = args;
  }
  bindType(type, bindings) {
    bindings = bindings || Object.create(null);
    if (!(type instanceof TemplateType) || this.name !== type.name) {
      return null;
    }
    if (this.args.length !== type.args.length) {
      return null;
    }
    for (let i = 0; i < this.args.length; i++) {
      if (this.args[i].bindType(type.args[i], bindings) === null) {
        return null;
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
    return new TemplateType(this.name, args);
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
}

// Lexer

const keywords = [
  "fn", "class", "let", "static", "async", "native",
  "return",
  "is", "not",
  "for", "if", "else", "while", "break", "continue",

  "var", "const", "goto", "function", "def", "async", "await",
];
const symbols = [
  "(", ")", "[", "]", "{", "}", ",",
  ";", "#", "$", "=",
  "+", "-", "*", "/", "%", "++", "--",
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
];

class Parser {
  constructor(uri, text) {
    this._tokens = lex(uri, text);
    this._pos = 0;
    this._funcname = null;
    this._staticBlockId = 0;
  }
  getNextStaticBlockId() {
    return this._staticBlockId++;
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
      } else if (this.at("let")) {
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
    const name = isStatic ?
        "staticBlock__" + this.getNextStaticBlockId() :
        this.expect("NAME").val;
    this._funcname = name;
    const args = isStatic ? [] : this.parseArgumentsTemplate();
    const ret = isStatic ?
        new TypenameTemplate(token, "Void") : this.parseTypeTemplate();
    let body = null;
    if (isNative) {
      body = this.expect("STRING").val;
    } else {
      body = this.parseStatementTemplate();
    }
    this._funcname = null;
    return {
      "type": "FunctionTemplate",
      "token": token,
      "isStatic": isStatic,
      "isNative": isNative,
      "name": name,
      "args": args,
      "ret": ret,
      "body": body,
    };
  }
  parseArgumentsTemplate() {
    this.expect(openParen);
    const args = [];
    while (!this.consume(closeParen)) {
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
    const name = this.expect("TYPENAME").val;
    if (this.consume(openBracket)) {
      const args = [];
      while (!this.consume(closeBracket)) {
        args.push(this.parseTypeTemplate());
        if (!this.at(closeBracket)) {
          this.expect(",");
        }
      }
      return new TemplateTypeTemplate(token, name, args);
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
    } else if (this.consume("let")) {
      const name = this.expect("NAME").val;
      const cls = this.at("=") ? null : this.parseTypeTemplate();
      const val = this.consume("=") ? this.parseExpressionTemplate() : null;
      this.expect(";");
      return {
        "type": "DeclarationTemplate",
        "token": token,
        "name": name,
        "cls": cls,
        "val": val,
      };
    } else if (this.consume("return")) {
      const expr = this.at(";") ? null : this.parseExpressionTemplate();
      this.expect(";");
      return {
        "type": "ReturnStatementTemplate",
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
    while (!this.consume(close)) {
      exprs.push(this.parseExpressionTemplate());
      if (!this.at(close)) {
        this.expect(",");
      }
    }
    return exprs;
  }
  parseExpressionTemplate() {
    return this.parseRelationalTemplate();
  }
  parseRelationalTemplate() {
    const expr = this.parseAdditiveTemplate();
    // NOTE: I don't want relational operators to be "chained" like
    // addition. It's kind of a weird thing to do. If you really need it,
    // use parenthesis.
    const token = this.peek();
    if (this.consume("==")) {
      const rhs = this.parseAdditiveTemplate();
      return makeFunctionCallTemplate(token, "equals", [expr, rhs]);
    }
    if (this.consume("!=")) {
      const rhs = this.parseAdditiveTemplate();
      return makeFunctionCallTemplate(token, "notEquals", [expr, rhs]);
    }
    if (this.consume("<")) {
      const rhs = this.parseAdditiveTemplate();
      return makeFunctionCallTemplate(token, "lessThan", [expr, rhs]);
    }
    if (this.consume("<=")) {
      const rhs = this.parseAdditiveTemplate();
      return makeFunctionCallTemplate(
          token, "lessThanOrEqualTo", [expr, rhs]);
    }
    if (this.consume(">")) {
      const rhs = this.parseAdditiveTemplate();
      return makeFunctionCallTemplate(token, "greaterThan", [expr, rhs]);
    }
    if (this.consume(">=")) {
      const rhs = this.parseAdditiveTemplate();
      return makeFunctionCallTemplate(
          token, "greaterThanOrEqualTo", [expr, rhs]);
    }
    if (this.consume("is")) {
      if (this.consume("not")) {
        const rhs = this.parseAdditiveTemplate();
        return makeFunctionCallTemplate(token, "isNot", [expr, rhs]);
      } else {
        const rhs = this.parseAdditiveTemplate();
        return makeFunctionCallTemplate(token, "isSameAs", [expr, rhs]);
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
            token, "add", [expr, this.parseMultiplicativeTemplate()]);
        continue;
      }
      if (this.consume("-")) {
        expr = makeFunctionCallTemplate(
            token, "subtract", [expr, this.parseMultiplicativeTemplate()]);
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
            token, "multiply", [expr, this.parsePrefixTemplate()]);
        continue;
      }
      if (this.consume("/")) {
        expr = makeFunctionCallTemplate(
            token, "divide", [expr, this.parsePrefixTemplate()]);
        continue;
      }
      if (this.consume("%")) {
        expr = makeFunctionCallTemplate(
            token, "modulo", [expr, this.parsePrefixTemplate()]);
        continue;
      }
      break;
    }
    return expr;
  }
  parsePrefixTemplate() {
    const token = this.peek();
    if (this.consume("!")) {
      return makeFunctionCallTemplate(token, "logicalNot", [
        this.parsePrefixTemplate(),
      ]);
    }
    if (this.consume("-")) {
      return makeFunctionCallTemplate(token, "negative", [
        this.parsePrefixTemplate(),
      ]);
    }
    if (this.consume("+")) {
      return makeFunctionCallTemplate(token, "positive", [
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
          expr = makeFunctionCallTemplate(token, "setItem", [expr, arg, val]);
        } else {
          expr = makeFunctionCallTemplate(token, "getItem", [expr, arg]);
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
    if (this.consume("INT")) {
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
        return makeFunctionCallTemplate(token, token.val, args);
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
        const rhs = this.parseExpressionTemplate();
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
    } else if (this.at("$") || this.at("TYPENAME")) {
      const cls = this.parseTypeTemplate();
      return {
        "type": "TypeExpressionTemplate",
        "token": token,
        "cls": cls,
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

function makeFunctionCallTemplate(token, name, args) {
  return {
    "type": "FunctionCallTemplate",
    "token": token,
    "name": name,
    "args": args,
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
    const token = functemp.token;
    currentInstantiationContext =
        serializeFunctionInstantiation(name, argtypes);
    const frame = new InstantiationFrame(token, currentInstantiationContext);
    const bindings = bindArgumentTypes(
        functemp.args.map(arg => arg[1]), argtypes);
    const ret = resolveTypeTemplate(functemp.ret, bindings);
    const argnames = functemp.args.map(targ => targ[0]);
    const args = [];
    for (let i = 0; i < argtypes.length; i++) {
      args.push([argnames[i], argtypes[i]]);
    }
    if (functemp.isNative) {
      currentInstantiationContext = null;
      return {
        "type": "Function",
        "token": token,
        "isStatic": functemp.isStatic,
        "isNative": functemp.isNative,
        "name": functemp.name,
        "args": args,
        "ret": ret,
        "body": functemp.body,
      };
    }
    pushScope();
    for (let i = 0; i < argtypes.length; i++) {
      const argname = argnames[i];
      if (argname !== null) {
        declareVariable(
            argnames[i], args[i][1], [frame].concat(flatten(stack)));
      }
    }
    const body = resolveStatement(functemp.body, bindings, stack);
    currentInstantiationContext = null;
    popScope();
    if (ret.equals(new Typename("Void"))) {
      if (body.maybeReturns !== null &&
          !body.maybeReturns.equals(new Typename("Void"))) {
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
    case "ReturnStatementTemplate":
      const expr = node.expr === null ?
          null : resolveExpression(node.expr, bindings, stack);
      const rettype = expr === null ? new Typename("Void") : expr.exprType;
      return {
        "type": "ReturnStatement",
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
      if (!cond.exprType.equals(new Typename("Bool"))) {
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
        "returns": body.returns,
        "maybeReturns": body.maybeReturns,
      };
    }
    case "IfTemplate": {
      const cond = resolveExpression(node.cond, bindings, stack);
      const frame = new InstantiationFrame(
          node.token, currentInstantiationContext);
      if (!cond.exprType.equals(new Typename("Bool"))) {
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
      if ((other === null || other.returns !== null) &&
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

  function resolveValueOrTypeExpression(node, bindings, stack) {
    const frame =
        new InstantiationFrame(node.token, currentInstantiationContext);
    switch(node.type) {
    case "FunctionCallTemplate":
      const name = node.name;
      const targs = node.args;
      const args = targs.map(targ =>
          resolveValueOrTypeExpression(targ, bindings, stack));
      const argtypes = args.map(arg => arg.exprType);
      const rettype = getFunctionReturnType(
          name, argtypes, [frame].concat(flatten(stack)));
      queueFunctionInstantiation(name, argtypes, [frame, stack]);
      // TODO: Figure out if I want type expression arguments to
      // fundamentally have different type signatures from runtime
      // expression arguments.
      // NOTE: This functemp should not be null since if it were,
      // "rettype = getFunctionReturnType(...)" should've thrown
      const functemp = findMatchingFunctionTemplate(name, argtypes);
      for (let i = 0; i < args.length; i++) {
        if (args[i].type === "TypeExpression") {
          if (functemp.args[i][0] !== null) {
            throw new InstantiationError(
                "Expected an expression but got a type expression: " +
                functemp.token.getLocationMessage(),
                [frame].concat(flatten(stack)));
          }
        } else if (functemp.args[i][0] === null) {
          throw new InstantiationError(
              "Expected a type expression but got an expression: " +
              functemp.token.getLocationMessage(),
              [frame].concat(flatten(stack)));
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
    case "Int":
    case "Float":
    case "String":
      return node;
    case "TypeExpressionTemplate":
      const cls = node.cls.resolve(bindings);
      queueClassInstantiation(cls);
      return {
        "type": "TypeExpression",
        "token": node.token,
        "exprType": cls,
      };
    case "CompileTimeErrorTemplate":
      throw new InstantiationError(
          node.message, [frame].concat(flatten(stack)));
    case "ListDisplayTemplate":
      if (node.exprs.length === 0) {
        throw new InstantiationError(
          "List displays must contain at least one element to allow for " +
          "type inference", [frame].concat(flatten(stack)));
      }
      const exprs = node.exprs.map(
          expr => resolveExpression(expr, bindings, stack));
      for (const expr of exprs) {
        if (!expr.exprType.equals(exprs[0].exprType)) {
          const frame = new InstantiationFrame(
              expr.token, currentInstantiationContext);
          throw new InstantiationError(
            "Expected " + exprs[0].exprType.toString() + " but got " +
            expr.exprType.toString(), [frame].concat(flatten(stack)));
        }
      }
      return {
        "type": "ListDisplay",
        "token": node.token,
        "exprs": exprs,
        "exprType": new TemplateType("List", [exprs[0].exprType]),
      };
    case "AssignTemplate":
      const val = resolveExpression(node.val, bindings, stack);
      const exprType = getVariableType(node.name, stack);
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
          (exprType.name !== "Int" && exprType.name !== "Float")) {
        throw new InstantiationError(
            "Augassign operations can only be done on int or float " +
            "variables: " + exprType.toString(),
            [frame].concat(flatten(stack)));
      }
      const val = resolveExpression(node.val, stack);
      if (!val.exprType.equals(exprType)) {
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
    const args = functemp.args;
    const bindings = bindArgumentTypes(args.map(arg => arg[1]), argtypes);
    return resolveTypeTemplate(functemp.ret, bindings);
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
        const bindings = bindArgumentTypes(
            functemp.args.map(arg => arg[1]), argtypes);
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
    const argtypes1 = left.args.map(arg => arg[1]);
    const argtypes2 = right.args.map(arg => arg[1]);
    const lefttemp = new TemplateTypeTemplate(left.token, "Args", argtypes1);
    const righttemp =
        new TemplateTypeTemplate(right.token, "Args", argtypes2);
    return lefttemp.compareSpecialization(righttemp) > 0;
  }

  function bindArgumentTypes(templateTypes, types, bindings) {
    const len = types.length;
    if (templateTypes.length !== len) {
      return null;
    }
    bindings = bindings || Object.create(null);
    for (let i = 0; i < len; i++) {
      const templateType = templateTypes[i];
      const type = types[i];
      if (!templateType.bindType(type, bindings)) {
        return null;
      }
    }
    return bindings;
  }

  function queueFunctionInstantiation(name, argtypes, stack) {
    const key = serializeFunctionInstantiation(name, argtypes);
    if (!instantiationTable[key]) {
      instantiationTable[key] = true;
      instantiationQueue.push([name, argtypes, stack]);
    }
  }

  function queueClassInstantiation(cls) {
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

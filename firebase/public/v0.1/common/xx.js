/* jshint esversion: 6 */

// TODO: This implementation has grown into a total mess due to the things
// I've added since my initial more modest goals were met. Do a major
// refactor.

// TODO: Show full stack traces on async functions. Right now
// I get traces that look like:
// Errored in runAsync: Error: hi
// Most recent call last:
//   File "test.xx", line 58, in asyncFunc
//   File "test.xx", line 63, in anotherAsyncFunc
//   File ??????, line ???, in error
// even though asyncMain awaited on asyncFunc, asyncMain isn't
// part of the stack trace.
// This can probably be accomplished by stitching together the trace
// as the exception is being propagated up async stack.

// TODO: Better understand how async stuff should come together, especially
// for better debugging. Might be worth it to switch to a separate
// Promise implementation that handles stitching stack traces for me.

// TODO: Downcasting to an interface is not possible at the moment,
// due to how downcasting checks are done. Fix this, perhaps by adding
// an attribute to all prototypes of classes that implement an interface,
// making interface implementation checks an attribute lookup.

// TODO: Currently, I don't check that a classes implementing interfaces
// implement all methods in an interface. For one, this allows for
// abstract classes, but on the other hand, it seems a tad bit iffy that
// user can't yet specify when a class should implement all the methods
// of its interfaces.

// TODO: Right now, there's no check to disallow implementing clashing
// interfaces -- that is, the interfaces have same method names, but
// different method signature. This means implementing both of them
// is impossible. The check only comes when trying to actually implement
// the method. In the future, check directly for implementing clashing
// interfaces

// Maybe I should rename this language to 'misc'?
const xx = Object.create(null);
(function(exports) {
"use strict";

class RuntimeError extends Error {}
class ConfigurationError extends Error {}

class Source {
  constructor(code, uri) {
    this.code = code;
    this.uri = uri;
    Object.freeze(this);
  }
}

const KEYWORDS = {
  // module and class
  package: true,
  import: true,
  as: true,
  native: true,
  class: true,
  interface: true,
  extends: true,
  implements: true,

  // statements
  return: true,
  while: true,
  for: true,
  break: true,
  continue: true,
  in: true,
  if: true,
  else: true,

  // expressions
  this: true,
  super: true,
  and: true,
  or: true,
  is: true,
  not: true,
  true: true,
  false: true,
  null: true,

  // reserved words
    // Just because they are so loaded in other languages
    goto: true,
    new: true,
    var: true,
    abstract: true,
    boolean: true,
    byte: true,
    char: true,
    short: true,
    long: true,
    const: true,
    debugger: true,
    do: true,
    double: true,
    enum: true,
    export: true,
    final: true,
    function: true,
    instanceof: true,
    private: true,
    protected: true,
    public: true,
    static: true,
    throws: true,
    transient: true,
    volatile: true,
    with: true,
    typeof: true,
    from: true,
    yield: true,
    raise: true,
    pass: true,
    lambda: true,
    // Words I have plans for in the future
    auto: true,
    let: true,
    switch: true,
    case: true,
    default: true,
    delete: true,
    throw: true,
    try: true,
    catch: true,
    finally: true,
    async: true,
    await: true,
};

const ESCAPE_TABLE = {
  n: '\n',
  t: '\t',
  r: '\r',
  '"': '"',
  "'": "'",
};

const REVERSE_ESCAPE_TABLE = Object.create(null);
for (const key in ESCAPE_TABLE) {
  REVERSE_ESCAPE_TABLE[ESCAPE_TABLE[key]] = key;
}

function sanitizeString(str) {
  let newstr = '';
  for (const c of str) {
    if (REVERSE_ESCAPE_TABLE[c]) {
      newstr += '\\' + REVERSE_ESCAPE_TABLE[c];
    } else {
      newstr += c;
    }
  }
  return newstr;
}

const SYMBOLS = [
  '{', '}', '(', ')', '[', ']', ';',
  '.', ',',
  '+', '++', '-', '--', '*', '/', '%',
  '=', '+=', '-=', '*=', '/=', '%=',
  '==', '!=', '<', '>', '<=', '>=',
  '=>',
].sort().reverse();

const BINARY_OPERATOR_TABLE = {
  '+': '__add__',
  '-': '__sub__',
  '*': '__mul__',
  '/': '__div__',
  '%': '__mod__',
  '==': '__eq__',
  '!=': '__ne__',
  '<': '__lt__',
  '<=': '__le__',
  '>': '__gt__',
  '>=': '__ge__',
};

function isSpace(ch) {
  return ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r' ||
         ch === '\v';
}

const FUNCTIONAL_OPERATORS_TABLE = {
  len: true,
  str: true,
  repr: true,
  int: true,
  float: true,
  iter: true,
  next: true,
  more: true,
  hash: true,
};

function isFunctionalOperator(str) {
  return !!FUNCTIONAL_OPERATORS_TABLE[str];
}

const PRIMITIVE_TABLE = {
  void: 'Void', bool: 'Bool', float: 'Float', int: 'Int', string: 'String',
};

function isPrimitive(str) {
  return !!PRIMITIVE_TABLE[str];
}

function getWrapperType(prim) {
  if (!PRIMITIVE_TABLE[prim]) {
    throw new TranspileError(prim + " is not a primitive type");
  }
  return PRIMITIVE_TABLE[prim];
}

function isWrapperTypeFor(type, prim) {
  return PRIMITIVE_TABLE[prim] === type;
}

function isTypename(str) {
  return isPrimitive(str) ||
         /[A-Z]/.test(str[0]) && (str.length === 1 || /[a-z]/.test(str));
}

function isName(str) {
  return /^[A-Za-z_0-9$]+$/.test(str);
}

function isDigit(str) {
  return /^[0-9]+$/.test(str);
}

class Token {
  constructor(source, pos, type, val) {
    this.source = source;
    this.pos = pos;
    this.type = type;
    this.val = val;
    Object.freeze(this);
  }
  inspect() {
    return "Token(" + this.type + ", " + this.val + ")";
  }
  toString() {
    return this.inspect();
  }
  getModuleTag() {
    return '\n//TAG:MODULE:' + this.source.uri;
  }
  getLine() {
    const text = this.source.code;
    const len = text.length;
    let start = this.pos;
    let end = this.pos;
    while (start > 0 && text[start-1] !== '\n') {
      start--;
    }
    while (end < len && text[end] !== '\n') {
      end++;
    }
    return text.slice(start, end);
  }
  getColumnNumber() {
    let colno = 1;
    let pos = this.pos;
    const text = this.source.code;
    while (pos > 0 && text[pos-1] !== '\n') {
      pos--;
      colno++;
    }
    return colno;
  }
  getLineNumber() {
    let lineno = 1;
    const text = this.source.code;
    const len = this.pos;
    for (let i = 0; i < len; i++) {
      if (text[i] === '\n') {
        lineno++;
      }
    }
    return lineno;
  }
  getLocationMessage() {
    return '\n  in File "' + this.source.uri +
           '" on line ' + this.getLineNumber() +
           '\n' + this.getLine() +
           '\n' + ' '.repeat(this.getColumnNumber()-1) + '*';
  }
  getStatementTag() {
    return '\n/*TAG:STMT:' + this.getLineNumber() + '*/';
  }
}

class TranspileError extends Error {
  constructor(message, tokens) {
    super(message + (tokens === undefined ? '' :
          tokens.map(token => token.getLocationMessage()).join("")));
  }
}

class Lexer {
  constructor(source) {
    if (!(source instanceof Source)) {
      throw new TranspileError(source);
    }
    this._source = source;
    this._code = source.code;
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
  _chpos(pos) {
    return pos < this._code.length ? this._code[pos] : '';
  }
  _ch(df) {
    if (df === undefined) { df = 0; }
    return this._chpos(this._pos + df);
  }
  _startsWith(prefix) {
    return this._code.startsWith(prefix, this._pos);
  }
  _skipSpacesAndComments() {
    while (true) {
      while (isSpace(this._ch())) {
        this._pos++;
      }
      if (this._startsWith('/*')) {
        const start = this._pos;
        while (!this._startsWith('*/')) {
          if (this._ch() === '') {
            throw new TranspileError("Multiline comment wasn't terminated!",
                                     [new Token(this._source,
                                                start, "ERR")]);
          }
          this._pos++;
        }
        continue;
      }
      if (this._ch() === '#' || this._startsWith('//')) {
        while (this._ch() !== '' && this._ch() !== '\n') {
          this._pos++;
        }
        continue;
      }
      break;
    }
  }
  _extract() {
    this._skipSpacesAndComments();
    if (this._ch() === '') {
      return new Token(this._source, this._pos, "EOF");
    }
    let start = this._pos;
    // STR
    if (this._startsWith('r"') || this._startsWith('"') ||
        this._startsWith("r'") || this._startsWith("'")) {
      let raw = false;
      if (this._ch() === 'r') {
        this._pos++;
        this.raw = true;
      }
      let q = this._ch();
      if (this._startsWith(q + q + q)) {
        q = q + q + q;
      }
      this._pos += q.length;
      let content = '';
      while (!this._startsWith(q)) {
        if (this._ch() === '') {
          throw new TranspileError('Expected more string but found EOF');
        }
        if (!raw && this._ch() === '\\') {
          this._pos++;
          content += ESCAPE_TABLE[this._ch()];
          this._pos++;
        } else {
          content += this._ch();
          this._pos++;
        }
      }
      this._pos += q.length;
      return new Token(this._source, start, "STR", content);
    }
    // INT/FLOAT
    while (isDigit(this._ch())) {
      this._pos++;
    }
    if (this._ch() === '.') {
      this._pos++;
    }
    while (isDigit(this._ch())) {
      this._pos++;
    }
    const numstr = this._code.slice(start, this._pos);
    if (numstr.length > 0 && numstr !== '.') {
      if (numstr.indexOf('.') !== -1) {
        return new Token(this._source, start, "FLOAT", numstr);
      } else {
        return new Token(this._source, start, "INT", numstr);
      }
    }
    this._pos = start;
    // NAME/TYPENAME/KEYWORD
    while (isName(this._ch())) {
      this._pos++;
    }
    if (this._pos > start) {
      const str = this._code.slice(start, this._pos);
      if (KEYWORDS[str]) {
        return new Token(this._source, start, str);
      } else if (isTypename(str)) {
        return new Token(this._source, start, "TYPENAME", str);
      } else {
        return new Token(this._source, start, "NAME", str);
      }
    }
    // SYMBOL
    for (let symbol of SYMBOLS) {
      if (this._startsWith(symbol)) {
        this._pos += symbol.length;
        return new Token(this._source, start, symbol);
      }
    }
    // ERROR
    let content = '';
    while (this._ch() !== '' && !isSpace(this._ch())) {
      content += this._ch();
      this._pos++;
    }
    throw new TranspileError("Invalid token: " + content,
                             [new Token(this._source, start, 'ERROR')]);
  }
}

{
  const source = new Source('hello world "hi" 5 5.5 class --', 'uri');
  const lexer = new Lexer(source);
  const tokens = [];
  while (lexer.peek().type !== 'EOF') {
    tokens.push(lexer.next());
  }
  if (tokens.toString() !==
      "Token(NAME, hello),Token(NAME, world),Token(STR, hi)," +
      "Token(INT, 5),Token(FLOAT, 5.5),Token(class, undefined)," +
      "Token(--, undefined)") {
    throw new TranspileError(tokens.toString());
  }
}

function lex(code, uri) {
  const lexer = new Lexer(new Source(code, uri));
  const tokens = [];
  while (lexer.peek().type !== 'EOF') {
    tokens.push(lexer.next());
  }
  tokens.push(lexer.peek());
  return tokens;
}

class Parser {
  constructor(code, uri) {
    this._tokens = lex(code, uri);
    this._pos = 0;
  }
  peek(df) {
    if (df === undefined) {
      df = 0;
    }
    return this._tokens[Math.min(this._pos + df, this._tokens.length - 1)];
  }
  next() {
    const token = this.peek();
    this._pos++;
    return token;
  }
  at(type, df) {
    return this.peek(df).type === type;
  }
  consume(type) {
    if (this.at(type)) {
      return this.next();
    }
  }
  expect(type) {
    if (!this.at(type)) {
      throw new TranspileError(
          "Expected " + type + " but got " + this.peek(),
          [this.peek()]);
    }
    return this.next();
  }
  parseModule() {
    const token = this.peek();
    let pkg = '';
    if (this.consume('package')) {
      pkg = this.expect('NAME').val;
      while (this.consume('.')) {
        pkg += '__' + this.expect('NAME').val;
      }
      pkg += '__';
      this.expect(';');
    }
    const imports = [];
    while (this.at('import')) {
      const token = this.expect('import');
      let pkgName = '';
      while (this.at('.', 1)) {
        pkgName += this.expect('NAME').val + '__';
        this.expect('.');
      }
      const nameType = this.peek().type;
      const name = (nameType === 'NAME' ? this.expect('NAME') :
                                          this.expect('TYPENAME')).val;
      let alias = '';
      if (this.consume('as')) {
        alias = this.expect(nameType).val;
      } else {
        alias = name;
      }
      this.expect(';');
      imports.push(new Import(token, pkgName, name, alias));
    }
    const stmts = [];
    while (!this.at('EOF')) {
      if (this.at('TYPENAME') && this.at('NAME', 1) && this.at(';', 2)) {
        stmts.push(this.parseGlobalDecl());
      } else if (this.at('class') || this.at('interface') ||
                 (this.at('native') && (
                  this.at('class', 1) || this.at('interface', 1)))) {
        stmts.push(this.parseClassDef());
      } else if (this.at("static")) {
        stmts.push(this.parseStaticBlock());
      } else {
        stmts.push(this.parseGlobalFuncDef());
      }
    }
    return new NameMangler(new Module(token, pkg, imports, stmts)).mangle();
  }
  parseStaticBlock() {
    const token = this.expect("static");
    const body = this.parseBlock();
    return new StaticBlock(token, body);
  }
  parseGlobalDecl() {
    const token = this.peek();
    const cls = this.expect('TYPENAME').val;
    const name = this.expect('NAME').val;
    this.expect(';');
    return new GlobalDecl(token, cls, name);
  }
  parseArgs() {
    const OPEN = '(';
    const CLOSE = ')';
    this.expect(OPEN);
    const args = [];
    while (!this.consume(CLOSE)) {
      const argtype = this.expect('TYPENAME').val;
      const argname = this.expect('NAME').val;
      args.push([argtype, argname]);
      if (!this.at(CLOSE)) {
        this.expect(',');
      }
    }
    return args;
  }
  parseGlobalFuncDef() {
    const token = this.peek();
    const isNative = !!this.consume('native');
    return this.parseFuncDef(token, isNative);
  }
  parseClassDef() {
    const token = this.peek();
    const isNative = !!this.consume('native');
    const isInterface = !!this.consume('interface');
    if (!isInterface) {
      this.expect('class');
    }
    const name = this.expect('TYPENAME').val;
    let base = null;
    if (this.consume('extends')) {
      base = this.expect('TYPENAME').val;
    }
    if (!isNative && base === null) {
      base = 'Object';
    }
    const interfs = [];
    if (this.consume('implements')) {
      interfs.push(this.expect('TYPENAME').val);
      while (this.consume(',')) {
        interfs.push(this.expect('TYPENAME').val);
      }
    }
    this.expect('{');
    const attrs = [];
    if (!isNative && !isInterface) {
      while (this.at('TYPENAME') && this.at('NAME', 1) && this.at(';', 2)) {
        const attrtype = this.expect('TYPENAME').val;
        const attrname = this.expect('NAME').val;
        this.expect(';');
        attrs.push([attrtype, attrname]);
      }
    }
    const methods = [];
    while (!this.consume('}')) {
      methods.push(this.parseFuncDef(this.peek(), isNative||isInterface));
    }
    return new ClassDef(token, isNative, isInterface,
                        name, base, interfs, attrs, methods);
  }
  parseFuncDef(token, isNativeOrInterface) {
    const isAsync = !!this.consume("async");
    const ret = this.expect('TYPENAME').val;
    const name = this.expect('NAME').val;
    const args = this.parseArgs();
    let body = null;
    if (isNativeOrInterface) {
      this.expect(';');
    } else {
      body = this.parseBlock();
    }
    return new FuncDef(token, isAsync, ret, name, args, body);
  }
  parseBlock() {
    const token = this.expect('{');
    const stmts = [];
    while (!this.consume('}')) {
      stmts.push(this.parseStatement());
    }
    return new Block(token, stmts);
  }
  parseStatement() {
    const token = this.peek();
    const OPEN = '{';
    const CLOSE = '}';
    if (this.at(OPEN)) {
      return this.parseBlock();
    } else if (this.consume('break')) {
      this.expect(';');
      return new Break(token);
    } else if (this.consume('continue')) {
      this.expect(';');
      return new Continue(token);
    } else if (this.consume('return')) {
      if (this.consume(";")) {
        return new Return(token, null);
      } else {
        const expr = this.parseExpression();
        this.expect(';');
        return new Return(token, expr);
      }
    } else if (this.consume('if')) {
      this.expect('(');
      const cond = this.parseExpression();
      this.expect(')');
      const body = this.parseBlock();
      let other = null;
      if (this.consume('else')) {
        if (this.at('if') || this.at(OPEN)) {
          other = this.parseStatement();
        } else {
          throw new TranspileError(
              "Expected another if or block statement for else clause " +
              "but found " + this.peek(),
              [this.peek()]);
        }
      }
      return new If(token, cond, body, other);
    } else if (this.consume('for')) {
      this.expect('(');
      const init = this.parseStatement();
      if (!(init instanceof Decl) && !(init instanceof ExpressionStatement)) {
        throw new TranspileError(
            "The init portion of a classic for loop must be a declaration" +
            " or an expression but found " + init.constructor.name,
            [init.peek()]);
      }
      const cond = this.parseExpression();
      this.expect(';');
      const incr = this.parseExpression();
      this.expect(')');
      const body = this.parseBlock();
      return new For(token, init, cond, incr, body);
    } else if (this.consume('while')) {
      this.expect('(');
      const expr = this.parseExpression();
      this.expect(')');
      const body = this.parseBlock();
      return new While(token, expr, body);
    } else if (this.at('TYPENAME') && this.at('NAME', 1)) {
      const cls = this.expect('TYPENAME').val;
      const name = this.expect('NAME').val;
      let expr = null;
      if (this.consume('=')) {
        expr = this.parseExpression();
      }
      this.expect(';');
      return new Decl(token, cls, name, expr);
    } else {
      const expr = this.parseExpression();
      this.expect(';');
      return new ExpressionStatement(token, expr);
    }
  }
  parseExpression() {
    return this.parseConditional();
  }
  parseExpressionList(open, close) {
    this.expect(open);
    const exprs = [];
    while (!this.consume(close)) {
      exprs.push(this.parseExpression());
      if (!this.at(close)) {
        this.expect(',');
      }
    }
    return exprs;
  }
  parseConditional() {
    let expr = this.parseOr();
    const token = this.peek();
    if (this.consume('?')) {
      const left = this.parseOr();
      this.expect(':');
      const right = this.parseConditional();
      return new SpecialOp(token, '?:', [expr, left, right]);
    }
    return expr;
  }
  parseOr() {
    let expr = this.parseAnd();
    while (true) {
      const token = this.peek();
      if (this.consume('or')) {
        const rhs = this.parseAnd();
        expr = new SpecialOp(token, 'or', [expr, rhs]);
        continue;
      }
      break;
    }
    return expr;
  }
  parseAnd() {
    let expr = this.parseNot();
    while (true) {
      const token = this.peek();
      if (this.consume('and')) {
        const rhs = this.parseNot();
        expr = new SpecialOp(token, 'and', [expr, rhs]);
        continue;
      }
      break;
    }
    return expr;
  }
  parseNot() {
    const token = this.peek();
    if (this.consume('not')) {
      const expr = this.parseNot();
      return new SpecialOp(token, 'not', [expr]);
    }
    return this.parseComparison();
  }
  parseComparison() {
    let expr = this.parseAdditive();
    while (true) {
      const token = this.peek();
      if (this.consume('==') || this.consume('!=') ||
          this.consume('<=') || this.consume('<') ||
          this.consume('>=') || this.consume('>')) {
        const methodName = BINARY_OPERATOR_TABLE[token.type];
        const rhs = this.parseAdditive();
        expr = new MethodCall(token, expr, methodName, [rhs]);
        continue;
      }
      if (this.consume("is")) {
        if (this.consume("not")) {
          const rhs = this.parseAdditive();
          expr = new SpecialOp(token, "is not", [expr, rhs]);
        } else {
          const rhs = this.parseAdditive();
          expr = new SpecialOp(token, "is", [expr, rhs]);
        }
        continue;
      }
      break;
    }
    return expr;
  }
  parseAdditive() {
    let expr = this.parseMultiplicative();
    while (true) {
      const token = this.peek();
      if (this.consume('+') || this.consume('-')) {
        const methodName = BINARY_OPERATOR_TABLE[token.type];
        const rhs = this.parseMultiplicative();
        expr = new MethodCall(token, expr, methodName, [rhs]);
        continue;
      }
      break;
    }
    return expr;
  }
  parseMultiplicative() {
    let expr = this.parsePrefix();
    while (true) {
      const token = this.peek();
      if (this.consume('*') || this.consume('/') || this.consume('%')) {
        const methodName = BINARY_OPERATOR_TABLE[token.type];
        const rhs = this.parsePrefix();
        expr = new MethodCall(token, expr, methodName, [rhs]);
        continue;
      }
      break;
    }
    return expr;
  }
  parsePrefix() {
    const token = this.peek();
    if (this.consume('-')) {
      return new MethodCall(token, this.parsePrefix(), '__neg__', []);
    }
    if (this.consume('+')) {
      return new MethodCall(token, this.parsePrefix(), '__pos__', []);
    }
    return this.parsePostfix();
  }
  parsePostfix() {
    const OPEN = '(';
    const CLOSE = ')';
    let expr = this.parsePrimary();
    while (true) {
      const token = this.peek();
      if (this.consume('.')) {
        const name = this.expect('NAME').val;
        if (this.at(OPEN)) {
          const args = this.parseExpressionList(OPEN, CLOSE);
          expr = new MethodCall(token, expr, name, args);
        } else if (this.consume("=")) {
          const result = this.parseExpression();
          expr = new SetAttr(token, expr, name, result);
        } else {
          expr = new GetAttr(token, expr, name);
          if (this.at('+=') || this.at('-=') ||
              this.at('*=') || this.at('/=') || this.at('%=')) {
            const op = this.next().type;
            const rhs = this.parseExpression();
            expr = new SpecialOp(token, op, [expr, rhs]);
          } else if (this.at('++') || this.at('--')) {
            const op = this.next().type;
            expr = new SpecialOp(token, op, [expr]);
          }
        }
        continue;
      } else if (this.consume('[')) {
        const key = this.parseExpression();
        this.expect(']');
        if (this.consume('=')) {
          const val = this.parseExpression();
          expr = new MethodCall(token, expr, '__setitem__', [key, val]);
        } else {
          expr = new MethodCall(token, expr, '__getitem__', [key]);
        }
        continue;
      } else if (this.consume("as")) {
        const cls = this.expect("TYPENAME").val;
        expr = new As(token, expr, cls);
      }
      break;
    }
    return expr;
  }
  parsePrimary() {
    const OPEN = '(';
    const CLOSE = ')';
    const OPEN_BRACKET = '[';
    const CLOSE_BRACKET = ']';
    const OPEN_BRACE = '{';
    const CLOSE_BRACE = '}';
    const token = this.peek();
    if (this.at(OPEN) &&
        (this.at(CLOSE, 1) ||
         this.at('TYPENAME', 1) && this.at('NAME', 2))) {
      const args = this.parseArgs();
      this.expect('=>');
      let body = null;
      if (this.at(OPEN_BRACE)) {
        body = this.parseBlock();
      } else {
        body = new Block(token, [new Return(token, this.parseExpression())]);
      }
      return new Lambda(token, args, body);
    }
    if (this.consume(OPEN)) {
      const expr = this.parseExpression();
      this.expect(CLOSE);
      return expr;
    }
    if (this.consume(OPEN_BRACKET)) {
      const exprs = [];
      while (!this.consume(CLOSE_BRACKET)) {
        exprs.push(this.parseExpression());
        if (!this.at(CLOSE_BRACKET)) {
          this.expect(',');
        }
      }
      return new ListDisplay(token, exprs);
    }
    if (this.consume('TYPENAME')) {
      const typename = token.val;
      if (this.at(OPEN_BRACKET)) {
        if (!isPrimitive(typename)) {
          throw new TranspileError("Vectors can only contain primitive types");
        }
        const exprs = this.parseExpressionList('[', ']');
        return new VectorDisplay(token, typename, exprs);
      }
      const args = this.parseExpressionList('(', ')');
      if (isFunctionalOperator(typename)) {
        if (args.length !== 1) {
          throw new TranspileError(
              typename + " expects exactly 1 arg but got " +
              args.length);
        }
        return new MethodCall(token, args[0], '__' + typename + '__', []);
      } else {
        return new New(token, typename, args);
      }
    }
    if (this.consume('true')) {
      return new SpecialOp(token, 'true', []);
    }
    if (this.consume('false')) {
      return new SpecialOp(token, 'false', []);
    }
    if (this.consume("null")) {
      return new SpecialOp(token, "null", []);
    }
    if (this.consume('this')) {
      return new This(token);
    }
    if (this.consume("await")) {
      return new SpecialOp(token, "await", [this.parseExpression()]);
    }
    if (this.consume('NAME')) {
      const name = token.val;
      if (this.at(OPEN)) {
        const args = this.parseExpressionList(OPEN, CLOSE);
        if (isFunctionalOperator(name)) {
          if (args.length !== 1) {
            throw new TranspileError(
                name + " expects exactly 1 arg but got " +
                args.length);
          }
          return new MethodCall(token, args[0], '__' + name + '__', []);
        } else {
          return new FuncCall(token, name, args);
        }
      } else if (this.at('+=') || this.at('-=') ||
                 this.at('*=') || this.at('/=') || this.at('%=')) {
        const op = this.next().type;
        const rhs = this.parseExpression();
        return new SpecialOp(token, op, [new Name(token, name), rhs]);
      } else if (this.at('++') || this.at('--')) {
        const op = this.next().type;
        return new SpecialOp(token, op, [new Name(token, name)]);
      } else if (this.consume('=')) {
        const expr = this.parseExpression();
        return new Assign(token, name, expr);
      } else {
        return new Name(token, name);
      }
    }
    if (this.consume("STR")) {
      const val = token.val;
      return new Str(token, val);
    }
    if (this.consume("INT")) {
      const val = token.val;
      return new Int(token, val);
    }
    if (this.consume("FLOAT")) {
      const val = token.val;
      return new Float(token, val);
    }
    throw new TranspileError("Expected expression but found " + this.peek());
  }
}

function parse(code, uri) {
  return new Parser(code, uri).parseModule();
}

function indent(code) {
  return code.replace(/\n/g, '\n  ');
}

const BUILTINS_LIST = [
  "void", "bool", "int", "float", "string",
  "Bool", "Int", "Float", "String",
  "Object", "List",
  "BoolVector", "IntVector", "FloatVector", "StringVector",
  "Lambda", "Promise",
  "print", "input",
  "assertWithMessage", "assertEqualWithMessage", "assertThrowWithMessage",
  "assert", "assertEqual", "assertThrow", "asyncSleep",
];

class NameMangler {
  constructor(module) {
    this._module = module;
    this._aliases = Object.create(null);
    this._package = module.pkg;
    this._localsStack = [Object.create(null)];
    for (const item of BUILTINS_LIST) {
      this._aliases[item] = item;
    }
  }
  mangle() {
    this._visit(this._module);
    return this._module;
  }
  _visit(node) {
    const name = '_visit' + node.constructor.name;
    if (!this[name]) {
      throw new TranspileError(
          "No such method NameMangler." + name, [node.token]);
    }
    this[name](node);
  }
  _visitModule(node) {
    for (const imp of node.imports) {
      this._visit(imp);
    }
    for (const stmt of node.stmts) {
      this._visit(stmt);
    }
  }
  _visitImport(node) {
    if (this._aliases[node.alias]) {
      throw new TranspileError(
          "Name " + node.alias + " is already being used", [node.token]);
    }
    this._aliases[node.alias] = node.getFullName();
  }
  _mangleGlobalName(name) {
    if (this._aliases[name]) {
      return this._aliases[name];
    } else {
      const mangledName = this._mangleNameWithPackage(name);
      this._aliases[name] = mangledName;
      return mangledName;
    }
  }
  _visitClassDef(node) {
    node.name = this._mangleGlobalName(node.name);
    if (node.base !== null) {
      node.base = this._mangleGlobalName(node.base);
    }
    node.interfs = node.interfs.map(
        interf => this._mangleGlobalName(interf));
    for (const method of node.methods) {
      this._visitMethod(method);
    }
  }
  _visitMethod(node) {
    this._visitFuncDef(node, true);
  }
  _pushLocals() {
    const newLocals = Object.create(
        this._localsStack[this._localsStack.length-1]);
    this._localsStack.push(newLocals);
  }
  _popLocals() {
    this._localsStack.pop();
  }
  _declareLocalName(name) {
    this._localsStack[this._localsStack.length-1][name] = true;
  }
  _mangleNameWithPackage(name) {
    if (isTypename(name)) {
      return 'T__' + this._package + name;
    } else {
      return this._package + name;
    }
  }
  _mangleLocalName(name) {
    if (this._localsStack[this._localsStack.length-1][name]) {
      return name;
    } else if (this._aliases[name]) {
      return this._aliases[name];
    } else {
      return this._mangleNameWithPackage(name);
    }
  }
  _visitFuncDef(node, isMethod) {
    if (!isMethod) {
      node.name = this._mangleGlobalName(node.name);
    }
    this._pushLocals();
    node.ret = this._mangleLocalName(node.ret);
    node.args = node.args.map(arg => {
      const [cls, name] = arg;
      this._declareLocalName(name);
      return [this._mangleLocalName(cls), name];
    });
    if (node.body) {
      this._visit(node.body);
    }
    this._popLocals();
  }
  _visitStaticBlock(node) {
    this._visit(node.body);
  }
  _visitBlock(node) {
    this._pushLocals();
    for (const stmt of node.stmts) {
      this._visit(stmt);
    }
    this._popLocals();
  }
  _visitExpressionStatement(node) {
    this._visit(node.expr);
  }
  _visitFuncCall(node) {
    node.name = this._mangleLocalName(node.name);
    for (const arg of node.args) {
      this._visit(arg);
    }
  }
  _visitName(node) {
    node.name = this._mangleLocalName(node.name);
  }
  _visitStr(node) {}
  _visitIf(node) {
    this._visit(node.cond);
    this._visit(node.body);
    if (node.other) {
      this._visit(node.other);
    }
  }
  _visitSpecialOp(node) {
    for (const arg of node.args) {
      this._visit(arg);
    }
  }
  _visitMethodCall(node) {
    this._visit(node.owner);
    for (const arg of node.args) {
      this._visit(arg);
    }
  }
  _visitReturn(node) {
    if (node.expr !== null) {
      this._visit(node.expr);
    }
  }
  _visitFor(node) {
    this._visit(node.init);
    this._visit(node.cond);
    this._visit(node.incr);
    this._visit(node.body);
  }
  _visitInt(node) {}
  _visitFloat(node) {}
  _visitAssign(node) {
    node.name = this._mangleLocalName(node.name);
    this._visit(node.expr);
  }
  _visitDecl(node) {
    this._declareLocalName(node.name);
    node.cls = this._mangleLocalName(node.cls);
    node.name = this._mangleLocalName(node.name);
    if (node.expr) {
      this._visit(node.expr);
    }
  }
  _visitGlobalDecl(node) {
    node.cls = this._mangleLocalName(node.cls);
    node.name = this._mangleGlobalName(node.name);
  }
  _visitLambda(node) {
    this._pushLocals();
    node.args = node.args.map(arg => {
      const [cls, name] = arg;
      this._declareLocalName(name);
      return [this._mangleLocalName(cls), name];
    });
    this._visit(node.body);
    this._popLocals();
  }
  _visitListDisplay(node) {
    for (const expr of node.exprs) {
      this._visit(expr);
    }
  }
  _visitNew(node) {
    node.cls = this._mangleLocalName(node.cls);
    for (const arg of node.args) {
      this._visit(arg);
    }
  }
  _visitAs(node) {
    this._visit(node.expr);
    node.cls = this._mangleLocalName(node.cls);
  }
  _visitVectorDisplay(node) {
    node.cls = this._mangleLocalName(node.cls);
    for (const expr of node.exprs) {
      this._visit(expr);
    }
  }
  _visitSetAttr(node) {
    this._visit(node.owner);
    this._visit(node.expr);
  }
  _visitGetAttr(node) {
    this._visit(node.owner);
  }
  _visitThis(node) {}
}

class GrokData {
  constructor() {
    // attributes filled during 'grok'
    this._ancestry = Object.create(null);
    this._isNative = Object.create(null);
    this._funcsigs = Object.create(null);
    this._attrtypes = Object.create(null);
    this._astOfClass = Object.create(null);

    // Helpers during processInheritanceData
    this._processStarted = Object.create(null);
    this._processed = Object.create(null);

    // attributes filled/used during 'ann'
    this._currettypestack = [];
    this._varstack = new VarStack();
    this._tagTable = Object.create(null);
    this._tagTableLen = 0;

    // only used inside function definitions.
    this._funcName = null;

    // attributes only used inside class definitions.
    this._thisType = null;
  }
  setThisType(type) {
    this._thisType = type;
  }
  getThisType() {
    return this._thisType;
  }
  setFuncName(name) {
    this._funcName = name;
  }
  getFuncName() {
    return this._funcName;
  }
  getContextName() {
    const type = this.getThisType();
    if (type === null) {
      return this.getFuncName();
    } else {
      return type + "." + this.getFuncName();
    }
  }
  getTag(token) {
    const uri = token.source.uri;
    const contextName = this.getContextName();
    const lineno = token.getLineNumber();
    const message =
        "File \"" + uri + "\", in line " + lineno + ", in " + contextName;
    if (this._tagTable[message] === undefined) {
      this._tagTable[message] = ++this._tagTableLen;
    }
    return this._tagTable[message];
  }
  getTagToMessageTable() {
    const table = Object.create(null);
    for (const message in this._tagTable) {
      table[this._tagTable[message]] = message;
    }
    return table;
  }
  declareClass(classDef) {
    const isNative = classDef.isNative;
    const isInterface = classDef.isInterface;
    const name = classDef.name;
    const base = classDef.base;
    const interfs = classDef.interfs;
    this._astOfClass[name] = classDef;
    if (this._ancestry[name]) {
      throw new TranspileError("Class " + name + " redeclared");
    }
    this._isNative[name] = isNative;
    this._ancestry[name] = Object.create(null);
    if (base !== null) {
      this._ancestry[name][base] = true;
    }
    for (const interf of interfs) {
      this._ancestry[name][interf] = true;
    }
  }
  isNative(cls) {
    return !!this._isNative[cls];
  }
  isInterface(cls) {
    return this._astOfClass[cls].isInterface;
  }
  getLinearConcreteClassesList() {
    const clss = {};
    let len = 0;
    for (const name in this._astOfClass) {
      const ast = this._astOfClass[name];
      if (!ast.isNative && !ast.isInterface) {
        clss[ast.name] = ast;
        len++;
      }
    }
    const orderedClss = [];
    // clss contains all the classes still left to be processed.
    // If the base of a class is no longer in clss, it's safe to
    // add that class to orderedClss.
    while (len > 0) {
      for (const key of Object.keys(clss).sort()) {
        const cls = clss[key];
        if (!clss[cls.base]) {
          orderedClss.push(cls);
          delete clss[key];
          len--;
          break;
        }
      }
    }
    return orderedClss;
  }
  processInheritanceData() {
    // Must be called after grok finishes but before ann starts.
    this._processStarted = Object.create(null);
    this._processed = Object.create(null);
    for (const className in this._ancestry) {
      this._process(className);
    }
    for (const className in this._ancestry) {
      this._mergeMethodSignaturesWithAncestors(className);
    }
  }
  _process(className) {
    if (className === null || this._processed[className]) {
      return;
    }
    if (this._processStarted[className]) {
      throw new Error(
          "Infinite recursion in inheritance with " + className);
    }
    this._processStarted[className] = true;
    if (!this._ancestry[className]) {
      throw new Error("No such class: " + className);
    }
    for (const baseName in this._ancestry[className]) {
      this._process(baseName);
    }
    for (const baseName of Object.keys(this._ancestry[className])) {
      this._ancestry[className][baseName] = true;
    }
    this._processed[className] = true;
  }
  _mergeMethodSignaturesWithAncestors(className) {
    // NOTE: This is probably very bad for very large number of classes and
    // functions (probably say 5000+ classes and functions)
    // Not an issue right now.
    const directMethods = Object.create(null);
    for (const funcName in this._funcsigs) {
      const [baseName, methodName] = funcName.split(".");
      if (baseName === className) {
        directMethods[methodName] = true;
      }
    }
    for (const funcName of Object.keys(this._funcsigs)) {
      const [baseName, methodName] = funcName.split(".");
      if (this.isSubclass(className, baseName)) {
        const key = className + '.' + methodName;
        if (!this._funcsigs[key]) {
          // We don't have a direct method, and we simply inherit from
          // our base.
          const [ret, args] = this._funcsigs[funcName];
          this._funcsigs[key] = [ret, Array.from(args)];
        } else if (!directMethods[methodName]) {
          // In this case, 'methodName' is not a direct method.
          // This means that the current values filled in at _funcsigs
          // are from another base. Assume that they are correct (
          // we will check for consistencies when we are processing the
          // classes for which they are direct methods).
          const aret = this._funcsigs[key][0];
          const aargs = this._funcsigs[key][1];
          const bret = this._funcsigs[funcName][0];
          const bargs = this._funcsigs[funcName][1];
          this._funcsigs[key][0] = this.isSubclass(aret, bret) ? aret : bret;
          const len = aargs.length;
          for (let i = 0; i < len; i++) {
            this._funcsigs[key][1][i] =
                this.isSubclass(aargs[i], bargs[i]) ? bargs[i] : aargs[i];
          }
        } else {
          // We have a direct method with same name as a base class.
          // We don't need to assign anything new to _funcsigs, but
          // we want to validate that this is legitimate.
          // The subclass must have a 'at least as specific' return type,
          // and must accept 'at least as broad' argument types
          // Also, argument length must be the same.
          const [baseRet, baseArgs] = this._funcsigs[funcName];
          const [ret, args] = this._funcsigs[key];
          if (args.length !== baseArgs.length) {
            throw new TranspileError(
                key + " accepts " + args.length + " args but its ancestor " +
                funcName + " accepts " + baseArgs.length);
          }
          if (!this.isSubclass(ret, baseRet)) {
            throw new TranspileError(
                key + " returns " + ret + " but its ancestor " +
                funcName + " returns " + baseRet);
          }
          for (let i = 0; i < args.length; i++) {
            if (!this.isSubclass(baseArgs[i], args[i])) {
              throw new TranspileError(
                  key + " accepts " + args[i] + " for arg " + i + " but " +
                  " its ancestor " +
                  funcName + " accepts " + baseArgs[i] + " for arg " + i);
            }
          }
        }
      }
    }
  }
  isSubclass(subclass, baseclass) {
    if (!isPrimitive(subclass) && !this._ancestry[subclass]) {
      throw new TranspileError("Class " + subclass + " is not defined");
    }
    return subclass === baseclass || (
        !isPrimitive(subclass) &&
        !!this._ancestry[subclass][baseclass]);
  }
  pushCurRettype(type) {
    this._currettypestack.push(type);
  }
  popCurRettype() {
    this._currettypestack.pop();
  }
  getCurRettype() {
    return this._currettypestack[this._currettypestack.length-1];
  }
  setVarType(name, type, tokens) {
    if (this._varstack.alreadySetLocally(name)) {
      throw new TranspileError("Redeclaration of variable " + name, tokens);
    }
    this._varstack.set(name, type);
  }
  getVarType(name, tokens) {
    if (!this._varstack.get(name)) {
      throw new TranspileError(
          "Variable " + name + " has not been declared", tokens);
    }
    return this._varstack.get(name);
  }
  pushVarstack() {
    this._varstack.push();
  }
  popVarstack() {
    this._varstack.pop();
  }
  setAttrType(className, attrName, type) {
    if (!this._attrtypes[className]) {
      this._attrtypes[className] = Object.create(null);
    }
    if (this._attrtypes[className][attrName]) {
      throw new TranspileError(
          "Duplicate definition of " + className + '.' + attrName);
    }
    this._attrtypes[className][attrName] = type;
  }
  getAttrType(className, attrName) {
    if (!this._attrtypes[className]) {
      throw new TranspileError("No such class " + className);
    }
    if (!this._attrtypes[className][attrName]) {
      throw new TranspileError("No such attribute " + className + "." + attrName);
    }
    return this._attrtypes[className][attrName];
  }
  setFuncsig(name, rettype, argtypes) {
    if (isFunctionalOperator(name)) {
      throw new TranspileError(
          name + " is a functional operator, so you can't define a global " +
          "function of the same name");
    }
    if (this._funcsigs[name]) {
      throw new TranspileError("Redeclaration of function " + name);
    }
    this._funcsigs[name] = [rettype, argtypes];
  }
  hasFunc(name) {
    return !!this._funcsigs[name];
  }
  getFuncsig(name, tokens) {
    if (!this._funcsigs[name]) {
      throw new TranspileError(
          "Function " + name + " not declared", tokens);
    }
    return this._funcsigs[name];
  }
  getRettype(name, tokens) {
    return this.getFuncsig(name, tokens)[0];
  }
  getArgtypes(name, tokens) {
    return this.getFuncsig(name, tokens)[1];
  }
  castable(src, dest) {
    return this.isSubclass(src, dest) ||
           this.isSubclass(dest, src) ||
           dest === 'Object' ||
           src === 'Object' ||
           isWrapperTypeFor(src, dest) ||
           isWrapperTypeFor(dest, src);
  }
  cast(expr, src, dest) {
    if (src === dest) {
      return expr;
    } else if (isPrimitive(src)) {
      if (src === 'bool' && (dest === 'Bool' || dest === 'Object')) {
        return '(' + expr + ' ? yy$true : yy$false)';
      } else if (isWrapperTypeFor(dest, src) || dest === 'Object') {
        return 'new xx$' + getWrapperType(src) + '(' + expr + ')';
      } else {
        throw new TranspileError("Cannot cast from " + src + " to " + dest);
      }
    } else if (isPrimitive(dest)) {
      if (isWrapperTypeFor(src, dest)) {
        return expr + '.val';
      } else if (src === 'Object') {
        return 'yy$dynamicCast(' + expr + ', xx$' +
               getWrapperType(dest) +  ').val';
      }
    } if (dest === 'Object') {
      return expr;
    } else if (this.isSubclass(src, dest)) {
      return expr;
    } else if (this.isSubclass(dest, src)) {
      return 'yy$dynamicCast(' + expr + ', xx$' + dest + ')';
    } else {
      throw new TranspileError(src + " is not castable to " + dest);
    }
  }
}

class Ast {
  // Ast has three important API methods.
  //   - grok(data)
  //       dump information about class hierarchy, attribute types,
  //       method types and method arg types in the 'data' object,
  //       (Only passes Module, GlobalDecl, FuncDef and ClassDef).
  //   - ann(data)
  //       use the data filled in during 'grok' to annotate expressions
  //       with types. In the future also validate.
  //   - gen()
  //       generate javascript code. Requires that 'ann' was already called
  //       to annotate the tree.
  constructor(token) {
    this.token = token;
  }
}

class VarStack {
  constructor() {
    this.stack = [Object.create(null)];
  }
  push() {
    this.stack.push(Object.create(this.stack[this.stack.length-1]));
  }
  pop() {
    this.stack.pop();
  }
  peek() {
    return this.stack[this.stack.length-1];
  }
  set(name, type) {
    this.peek()[name] = type;
  }
  get(name) {
    return this.peek()[name];
  }
  alreadySetLocally(name) {
    return Object.hasOwnProperty.apply(this.peek(), [name]);
  }
}

class Module extends Ast {
  constructor(token, pkg, imports, stmts) {
    super(token);
    this.pkg = pkg;  // string (e.g. local__one__)
    this.imports = imports;  // [Import]
    this.stmts = stmts;  // [GlobalDecl|FuncDef|ClassDef|StaticBlock]
  }
  grok(data) {
    for (const stmt of this.stmts) {
      stmt.grok(data);
    }
  }
  ann(data) {
    for (const stmt of this.stmts) {
      stmt.ann(data);
    }
  }
  gen() {
    return this.token.getModuleTag() +
           this.stmts.map((stmt) => stmt.gen()).join("");
  }
  gen2() {
    return this.token.getModuleTag() +
           this.stmts.map(stmt => stmt.gen2()).join("");
  }
}

class Import extends Ast {
  constructor(token, pkg, name, alias) {
    super(token);
    this.pkg = pkg;  // string (e.g. local__one__)
    this.name = name;  // string (NAME or TYPENAME)
    this.alias = alias;  // string (matches name)
  }
  getFullName() {
    if (isTypename(this.name)) {
      return 'T__' + this.pkg + this.name;
    } else {
      return this.pkg + this.name;
    }
  }
}

function getDefaultDeclareValue(type, tokens) {
  if (isPrimitive(type)) {
    switch(type) {
    case 'void':
      throw new TranspileError(
          "You can't declare a variable with type void!",
          tokens);
    case 'bool': return 'false';
    case 'int': return '0';
    case 'float': return '0.0';
    case 'string': return "''";
    default:
      throw new TranspileError(
          "Unrecognized primitive type: " + type, tokens);
    }
  }
  return 'null';
}

class GlobalDecl extends Ast {
  constructor(token, cls, name) {
    super(token);
    this.cls = cls;
    this.name = name;
  }
  grok(data) {
    // Global variables need to be available before they are declared
    data.setVarType(this.name, this.cls);
  }
  ann(data) {}
  gen() {
    return '\nlet xx$' + this.name + ' = ' +
           getDefaultDeclareValue(this.cls, [this.token]) + ';';
  }
  gen2() { return ""; }
}

class StaticBlock extends Ast {
  constructor(token, body) {
    super(token);
    this.body = body;
  }
  grok(data) {}
  ann(data) {
    this.body.ann(data);
  }
  gen() {
    return '';  // run this after all the definitions.
  }
  gen2() {
    return this.body.gen();
  }
}

class FuncDef extends Ast {
  constructor(token, isAsync, ret, name, args, body) {
    super(token);
    this.isAsync = isAsync;  // bool
    this.ret = ret;  // string (TYPENAME)
    this.name = name;  // string  (NAME)
    this.args = args;  // [(cls:string, name:string)]
    this.body = body;  // Block|undefined
  }
  getArgtypes() { return this.args.map(arg => arg[0]); }
  getArgnames() { return this.args.map(arg => arg[1]); }
  grok(data) {
    if (this.isAsync) {
      data.setFuncsig(this.name, "Promise", this.getArgtypes());
    } else {
      data.setFuncsig(this.name, this.ret, this.getArgtypes());
    }
  }
  ann(data) {
    // NOTE: 'int main()' is the only function that gets away with
    // not including an explicit return -- if it doesn't, we'll add
    // a return at the end of the function body.
    if (data.getThisType() === null &&
        this.name === 'main' && this.ret === 'int' &&
        !this.body.returns()) {
      this.body.stmts.push(new Return(this.token, new Int(this.token, '0')));
    }

    const oldFuncName = data.getFuncName();
    data.setFuncName(this.name);
    data.pushVarstack();
    if (this.isAsync && isPrimitive(this.ret)) {
      // If this is an async function, the return value must be
      // wrapped inside a promise. As a result, it must be an object.
      data.pushCurRettype(getWrapperType(this.ret));
    } else {
      data.pushCurRettype(this.ret);
    }
    for (const [type, arg] of this.args) {
      if (type === 'void') {
        throw new TranspileError(
            "You can't have a variable with type 'void'!", [this.token]);
      }
      data.setVarType(arg, type);
    }
    if (this.body) {
      this.body.ann(data);
    }
    if (this.ret !== 'void' && this.body !== null && !this.body.returns()) {
      throw new TranspileError(
          "Function " + this.name + " should return " +
          this.ret + " but might not return a value",
          [this.token]);
    }
    data.setFuncName(oldFuncName);
    data.popVarstack();
    data.popCurRettype();
  }
  genBody() {
    if (!this.body) {
      throw new TranspileError(
          "Tried to generate body for function without body", [this.token]);
    }
    const args = this.args.map(arg => '/*' + arg[0] + '*/ xx$' + arg[1]);
    const stub = '/*' + this.ret + '*/ xx$' + this.name +
                 '(' + args.join(",") + ')' +
                 this.body.gen();
    if (this.isAsync) {
      return "yy$asyncf(function* " + stub + ")";
    } else {
      return "function " + stub;
    }
  }
  gen() {
    if (this.body) {
      if (this.isAsync) {
        return "\nconst xx$" + this.name + " = " + this.genBody() + ";";
      } else {
        return "\n" + this.genBody();
      }
    } else {
      return '\n/* (native function) ' + this.name +
             '(' + this.getArgtypes().join(", ") + ') */';
    }
  }
  gen2() { return ""; }
}

class ClassDef extends Ast {
  constructor(token, isNative, isInterface,
              name, base, interfs, attrs, methods) {
    super(token);
    this.isNative = isNative;  // bool
    this.isInterface = isInterface;  // bool
    this.name = name;  // string
    this.base = base;  // string
    this.interfs = interfs;  // [string]
    this.attrs = attrs;  // [(type:string, name:string)]
    this.methods = methods;  // [FuncDef]

    // TODO: In the future, I want to allow extending classes from
    // an interface -- this would mean that implementing an interface
    // requires the class to extend from a subclass of what the interface
    // extends from.
    if (isInterface && base !== "Object") {
      throw new TranspileError(
          "Interfaces are not allowed to have 'extends' clauses yet",
          [token]);
    }
  }
  grok(data) {
    for (const method of this.methods) {
      data.setFuncsig(this.name + '.' + method.name,
                      method.ret, method.getArgtypes());
    }
    data.declareClass(this);
  }
  ann(data) {
    const oldThisType = data.getThisType();
    data.setThisType(this.name);
    for (const [type, name] of this.attrs) {
      data.setAttrType(this.name, name, type);
    }
    for (const method of this.methods) {
      method.ann(data);
    }
    data.setThisType(oldThisType);
    this.data = data;
  }
  genDecl() {
    if (this.base !== null && this.data.isInterface(this.base)) {
      throw new TranspileError(
          "You can't extend an interface (you can implement it though)",
          [this.token]);
    }
    for (const interf of this.interfs) {
      if (!this.data.isInterface(interf)) {
        throw new TranspileError(
            "You can only implement interfaces (you can only extend classes)",
            [this.token]);
      }
    }
    if (this.isNative) {
      return "\n/* (native class) " + this.name + " */";
    }
    if (this.isInterface) {
      return "\n/* (interface) " + this.name + " */";
    }
    const initAttrs = this.attrs.map(([type, name]) =>
        "\n  this.xx$" + name + " = " +
        getDefaultDeclareValue(type, [this.token]) + ";");
    return "\n\n// Class declaration for " + this.name +
           "\nfunction xx$" + this.name + "() {" +
           initAttrs.join("") +
           "\n  if (this.xx$__init__) {" +
           "\n    this.xx$__init__.apply(this, arguments);" +
           "\n  }" +
           "\n}" +
           "\nxx$" + this.name + ".prototype = Object.create(" +
               "xx$" + this.base + ".prototype);";
  }
  gen() {
    if (this.isInterface || this.isNative) {
      return "";
    }
    return this.methods.map(method =>
        "\nxx$" + this.name + ".prototype.xx$" + method.name + " = " +
        method.genBody().trim()) + ";";
  }
  gen2() { return ""; }
}

class Statement extends Ast {
}

class Block extends Statement {
  constructor(token, stmts) {
    super(token);
    this.stmts = stmts;
  }
  returns() {
    return this.stmts.length > 0 && this.stmts[this.stmts.length-1].returns();
  }
  ann(data) {
    data.pushVarstack();
    for (let stmt of this.stmts) {
      stmt.ann(data);
    }
    data.popVarstack();
  }
  gen() {
    return '\n{' +
           indent(this.stmts.map(stmt => stmt.gen()).join("")) +
           '\n}';
  }
}

class Decl extends Statement {
  constructor(token, cls, name, expr) {
    super(token);
    this.cls = cls;
    this.name = name;
    this.expr = expr;
  }
  returns() { return false; }
  ann(data) {
    if (this.expr !== null) {
      this.expr.ann(data);
      if (!data.castable(this.expr.exprType, this.cls)) {
        throw new TranspileError(
            "Tried to initialize variable of type " + this.cls +
            " with a value of type " + this.expr.exprType,
            [this.token]);
      }
    }
    data.setVarType(this.name, this.cls);
    this.data = data;
  }
  gen() {
    const tag = this.token.getStatementTag();
    if (this.expr === null) {
      return tag + 'let xx$' + this.name + ' = ' +
             getDefaultDeclareValue(this.cls, [this.token]) + ';';
    } else {
      return tag + 'let xx$' + this.name + ' = ' + this.data.cast(
          this.expr.gen(), this.expr.exprType, this.cls) + ';';
    }
  }
}

class If extends Statement {
  constructor(token, cond, body, other) {
    super(token);
    this.cond = cond;
    this.body = body;
    this.other = other;
  }
  returns() {
    return this.other !== null &&
           this.body.returns() &&
           this.other.returns();
  }
  ann(data) {
    this.cond.ann(data);
    this.body.ann(data);
    if (this.other !== null) {
      this.other.ann(data);
    }
    if (!data.castable(this.cond.exprType, 'bool')) {
      throw new TranspileError(
          "Condition to if statement must return bool type but got " +
          this.cond.exprType, [this.token]);
    }
    this.data = data;
  }
  gen() {
    const tag = this.token.getStatementTag();
    const header = tag + 'if (' +
                 this.data.cast(
                     this.cond.gen(),
                     this.cond.exprType,
                     'bool') + ')' + this.body.gen();
    if (this.other === null) {
      return header;
    } else {
      return header + '\nelse' + this.other.gen();
    }
  }
}

class While extends Statement {
  constructor(token, cond, body) {
    super(token);
    this.cond = cond;
    this.body = body;
  }
  returns() { return this.body.returns(); }
  ann(data) {
    this.cond.ann(data);
    this.body.ann(data);
    this.data = data;
    if (!data.castable(this.cond.exprType, 'bool')) {
      throw new TranspileError(
          "Condition to while statement must return bool type but got " +
          this.cond.exprType);
    }
  }
  gen() {
    const tag = this.token.getStatementTag();
    return tag + 'while (' + this.data.cast(
        this.cond.gen(), this.cond.exprType, 'bool') + ')' +
        this.body.gen();
  }
}

class For extends Statement {
  constructor(token, init, cond, incr, body) {
    super(token);
    this.init = init;
    this.cond = cond;
    this.incr = incr;
    this.body = body;
  }
  returns() { return this.body.returns(); }
  ann(data) {
    data.pushVarstack();
    this.init.ann(data);
    this.cond.ann(data);
    this.incr.ann(data);
    this.body.ann(data);
    if (!data.castable(this.cond.exprType, 'bool')) {
      throw new TranspileError(
          "Condition to for statement must return bool type but got " +
          this.cond.exprType);
    }
    data.popVarstack();
    this.data = data;
  }
  gen() {
    const tag = this.token.getStatementTag();
    const init = this.init.gen().replace(/;$/, '').replace(/\n/g, '');
    const cond = this.data.cast(this.cond.gen(), this.cond.exprType, 'bool');
    const incr = this.incr.gen();
    const body = this.body.gen();
    return tag + 'for (' + init + '; ' + cond + '; ' + incr + ')' +
           this.body.gen();
  }
}

class Break extends Statement {
  returns() { return false; }
  ann(data) {}
  gen() {
    const tag = this.token.getStatementTag();
    return  tag + 'break;';
  }
}

class Continue extends Statement {
  returns() { return false; }
  ann(data) {}
  gen() {
    const tag = this.token.getStatementTag();
    return tag + 'continue;';
  }
}

class Return extends Statement {
  constructor(token, expr) {
    super(token);
    this.expr = expr;  // Expression|null
  }
  returns() { return true; }
  ann(data) {
    if (this.expr !== null) {
      this.expr.ann(data);
    }
    if (data.getCurRettype() === "void" ||
        data.getCurRettype() === "Void") {
      if (this.expr !== null) {
        throw new TranspileError(
            "Function returns void but tried to return " +
            this.expr.exprType, [this.token]);
      }
    } else if (this.expr === null) {
      throw new TranspileError(
          "You can only omit return value inside of a void function, but" +
          " the current function must return " + data.getCurRettype(),
          [this.token]);
    } else if (!data.castable(this.expr.exprType, data.getCurRettype())) {
      throw new TranspileError(
          "Function returns " + data.getCurRettype() + " but tried to " +
          "return " + this.expr.exprType,
          [this.token]);
    }
    this.data = data;
    this.curtype = data.getCurRettype();
  }
  gen() {
    const tag = this.token.getStatementTag();
    if (this.expr === null) {
      return tag + "return;";
    } else {
      return tag + 'return ' + this.data.cast(
          this.expr.gen(), this.expr.exprType, this.curtype) + ';';
    }
  }
}

class ExpressionStatement extends Statement {
  constructor(token, expr) {
    super(token);
    this.expr = expr;
  }
  returns() { return false; }
  ann(data) {
    this.expr.ann(data);
  }
  gen() {
    const tag = this.token.getStatementTag();
    return tag + this.expr.gen() + ';';
  }
}

class Expression extends Ast {
  constructor(token) {
    super(token);
    this.exprType = null;
  }
}

function checkArgtypes(data, expectedTypes, actualTypes, message, tokens) {
  if (message === undefined) {
    message = '';
  }
  if (expectedTypes.length !== actualTypes.length) {
    throw new TranspileError("Expected " + expectedTypes.length + " args but got " +
                    actualTypes.length + message, tokens);
  }
  const len = expectedTypes.length;
  for (let i = 0; i < len; i++) {
    if (!data.castable(actualTypes[i], expectedTypes[i])) {
      throw new TranspileError(
          "Expected arg " + i + " to be " + expectedTypes[i] + " but got " +
          actualTypes[i], tokens);
    }
  }
}

function castArgs(data, args, expectedTypes) {
  const outArgs = [];
  for (let i = 0; i < expectedTypes.length; i++) {
    outArgs.push(
      data.cast(args[i].gen(),
                args[i].exprType, expectedTypes[i]));
  }
  return outArgs;
}

class FuncCall extends Expression {
  constructor(token, name, args) {
    super(token);
    this.name = name;
    this.args = args;
  }
  ann(data) {
    for (const arg of this.args) {
      arg.ann(data);
    }
    this.exprType = data.getRettype(this.name, [this.token]);
    const actualArgtypes = this.args.map(arg => arg.exprType);
    checkArgtypes(
        data, data.getArgtypes(this.name, [this.token]), actualArgtypes,
        " for function " + this.name, [this.token]);
    this.data = data;
  }
  gen() {
    const args = castArgs(this.data, this.args,
                          this.data.getArgtypes(this.name, [this.token]));
    return 'xx$' + this.name + '(' + args.join(", ") + ')';
  }
}

// NOTE: mixing int and float arithmetic is illegal by design.
const PRIMITIVE_METHOD_TABLE = {
  'int.__eq__(int)': ['bool', (owner, name, args) => {
    return '(' + owner.gen() + ' == ' + args[0].gen() + ')';
  }],
  'int.__ne__(int)': ['bool', (owner, name, args) => {
    return '(' + owner.gen() + ' != ' + args[0].gen() + ')';
  }],
  'int.__lt__(int)': ['bool', (owner, name, args) => {
    return '(' + owner.gen() + '<' + args[0].gen() + ')';
  }],
  'int.__le__(int)': ['bool', (owner, name, args) => {
    return '(' + owner.gen() + '<=' + args[0].gen() + ')';
  }],
  'int.__gt__(int)': ['bool', (owner, name, args) => {
    return '(' + owner.gen() + '>' + args[0].gen() + ')';
  }],
  'int.__ge__(int)': ['bool', (owner, name, args) => {
    return '(' + owner.gen() + '>=' + args[0].gen() + ')';
  }],
  'int.__neg__()': ['int', (owner, name, args) => {
    return '(-' + owner.gen() + ')';
  }],
  'int.__add__(int)': ['int', (owner, name, args) => {
    return '(' + owner.gen() + ' + ' + args[0].gen() + ')';
  }],
  'int.__sub__(int)': ['int', (owner, name, args) => {
    return '(' + owner.gen() + ' - ' + args[0].gen() + ')';
  }],
  'int.__mul__(int)': ['int', (owner, name, args) => {
    return '(' + owner.gen() + ' * ' + args[0].gen() + ')';
  }],
  'int.__div__(int)': ['int', (owner, name, args) => {
    return '((' + owner.gen() + ' / ' + args[0].gen() + ')|0)';
  }],
  'int.__mod__(int)': ['int', (owner, name, args) => {
    return '(' + owner.gen() + ' % ' + args[0].gen() + ')';
  }],
  'int.__str__()': ['string', (owner, name, args) => {
    return owner.gen() + '.toString()';
  }],
  'int.__repr__()': ['string', (owner, name, args) => {
    return owner.gen() + '.toString()';
  }],
  'int.__float__()': ['float', (owner, name, args) => {
    return owner.gen();
  }],
  'float.__add__(float)': ['float', (owner, name, args) => {
    return '(' + owner.gen() + ' + ' + args[0].gen() + ')';
  }],
  'float.__sub__(float)': ['float', (owner, name, args) => {
    return '(' + owner.gen() + ' - ' + args[0].gen() + ')';
  }],
  'float.__mul__(float)': ['float', (owner, name, args) => {
    return '(' + owner.gen() + ' * ' + args[0].gen() + ')';
  }],
  'float.__div__(float)': ['float', (owner, name, args) => {
    return '(' + owner.gen() + ' / ' + args[0].gen() + ')';
  }],
  'float.__str__()': ['string', (owner, name, args) => {
    return owner.gen() + '.toString()';
  }],
  'float.__int__()': ['int', (owner, name, args) => {
    return '(' + owner.gen() + '|0)';
  }],
  "string.__eq__(string)": ["bool", (owner, name, args) => {
    return "(" + owner.gen() + " == " + args[0].gen() + ")";
  }],
  'string.__add__(string)': ['string', (owner, name, args) => {
    return '(' + owner.gen() + ' + ' + args[0].gen() + ')';
  }],
  'string.__getitem__(int)': ['string', (owner, name, args) => {
    return 'yy$str_getitem(' + owner.gen() + ', ' + args[0].gen() + ')';
  }],
  'string.__repr__()': ['string', (owner, name, args) => {
    return 'yy$str_repr(' + owner.gen() + ')';
  }],
  "string.startsWith(string)": ["bool", (owner, name, args) => {
    return "yy$startsWith(" + owner.gen() + ", " + args[0].gen() + ")";
  }],
  "string.__int__()": ["int", (owner, name, args) => {
    return "yy$parseInt(" + owner.gen() + ")";
  }],
  "string.__float__()": ["float", (owner, name, args) => {
    return "yy$parseFloat(" + owner.gen() + ")";
  }],
};

function lookupPrimitiveMethodTable(owner, name, args, tokens) {
  const ownerType = owner.exprType;
  const argtypes = args.map(arg => arg.exprType);
  const key = ownerType + '.' + name + '(' + argtypes.join(",") + ')';
  if (!PRIMITIVE_METHOD_TABLE[key]) {
    throw new TranspileError(
        "No such primitive method with signature " + key, tokens);
  }
  return PRIMITIVE_METHOD_TABLE[key];
}

function getPrimitiveMethodType(owner, name, args, tokens) {
  const ownerType = owner.exprType;
  const argtypes = args.map(arg => arg.exprType);
  const key = ownerType + '.' + name + '(' + argtypes.join(",") + ')';
  return lookupPrimitiveMethodTable(owner, name, args, tokens)[0];
}

function genPrimitiveMethod(owner, name, args, tokens) {
  const ownerType = owner.exprType;
  const argtypes = args.map(arg => arg.exprType);
  const key = ownerType + '.' + name + '(' + argtypes.join(",") + ')';
  if (!PRIMITIVE_METHOD_TABLE[key]) {
    throw new TranspileError(
        "No such primitive method with signature " + key, tokens);
  }
  return lookupPrimitiveMethodTable(owner, name, args)[1](owner, name, args);
}

class MethodCall extends Expression {
  constructor(token, owner, name, args) {
    super(token);
    this.owner = owner;
    this.name = name;
    this.args = args;
  }
  ann(data) {
    this.owner.ann(data);
    for (const arg of this.args) {
      arg.ann(data);
    }
    const name = this.owner.exprType + '.' + this.name;
    if (isPrimitive(this.owner.exprType)) {
      // If the method is on a primitive type, we have special hardcoded
      // rules --
      this.exprType = getPrimitiveMethodType(
          this.owner, this.name, this.args, [this.token]);
      if (!this.exprType) {
        throw new TranspileError("No primitive method: " + name);
      }
    } else {
      this.exprType = data.getRettype(name, [this.token]);
      const actualArgtypes = this.args.map(arg => arg.exprType);
      checkArgtypes(data, data.getArgtypes(name), actualArgtypes,
                    [this.token]);
    }
    this.data = data;
  }
  gen() {
    if (isPrimitive(this.owner.exprType)) {
      // Primitive types have special hardcoded rules --
      return genPrimitiveMethod(
          this.owner, this.name, this.args, [this.token]);
    }
    const name = this.owner.exprType + '.' + this.name;
    const args = castArgs(this.data, this.args,
                          this.data.getArgtypes(name));
    return this.owner.gen() + '.xx$' + this.name +
           '(' + args.join(", ") + ')';
  }
}

class As extends Expression {
  constructor(token, expr, cls) {
    super(token);
    this.expr = expr;
    this.cls = cls;
  }
  ann(data) {
    this.expr.ann(data);
    this.exprType = this.cls;
    this.data = data;
    if (!data.castable(this.expr.exprType, this.cls)) {
      throw new TranspileError(
          this.expr.exprType + " is not castable to " + this.cls);
    }
  }
  gen() {
    return this.data.cast(this.expr.gen(), this.expr.exprType, this.cls);
  }
}


class SpecialOp extends Expression {
  constructor(token, op, args) {
    super(token);
    this.op = op;
    this.args = args;
  }
  ann(data) {
    for (const arg of this.args) {
      arg.ann(data);
    }
    switch(this.op) {
    case "await":
      if (!data.castable(this.args[0].exprType, "Promise")) {
        throw new TranspileError(
            "await must await on a Promise", [this.token]);
      }
      this.exprType = "Object";
      break;
    case "null":
      this.exprType = "Object";
      break;
    case 'true':
    case 'false':
      this.exprType = 'bool';
      break;
    case 'not':
      if (!data.castable(this.args[0].exprType, 'bool')) {
        throw new TranspileError(
            "not operator requires a bool argument", [this.token]);
      }
      this.exprType = 'bool';
      break;
    case 'and':
    case 'or':
      if (!data.castable(this.args[0].exprType, 'bool') ||
          !data.castable(this.args[1].exprType, 'bool')) {
        throw new TranspileError(
            this.op + " must have both left and right sides to be bool");
      }
      this.exprType = 'bool';
      break;
    case "is":
      this.exprType = "bool";
      break;
    case "is not":
      this.exprType = "bool";
      break;
    case '+=':
    case '-=':
    case '*=':
    case '/=':
    case '%=':
      if (this.args[0].exprType !== 'float' &&
          this.args[0].exprType !== 'int') {
        throw new TranspileError(
            this.op + " augassign operators can only be applied to int " +
            "and float types but found " + this.args[0].exprType);
      }
      if (!data.castable(this.args[1].exprType, this.args[0].exprType)) {
        throw new TranspileError(
            "Expected right hand side of " + this.op + " to be " +
            this.args[0].exprType + " but found " + this.args[1].exprType);
      }
      this.exprType = this.args[0].exprType;
      break;
    case '++':
    case '--':
      if (this.args[0].exprType !== 'int') {
        throw new TranspileError(
            this.op + " operator can only be applied to int types but " +
            "found " + this.args[0].exprType);
      }
      this.exprType = 'int';
      break;
    default:
      throw new TranspileError("Unrecognized special operator: " + this.op);
    }
    this.data = data;
  }
  gen() {
    switch(this.op) {
    case "await":
      return "(yield " +
             this.data.cast(
                this.args[0].gen(), this.args[0].exprType, "Promise") +
             ")";
    case "null":
      return "null";
    case 'true':
    case 'false':
      return this.op;
    case 'not':
      return '(!' + this.data.cast(this.args[0].gen(),
                                   this.args[0].exprType,
                                   'bool') + ')';
    case 'and':
    case 'or':
      return '(' +
             this.data.cast(this.args[0].gen(),
                            this.args[0].exprType,
                            'bool') +
             ' ' + {
               and: '&&',
               or: '||',
             }[this.op] + ' ' +
             this.data.cast(this.args[1].gen(),
                            this.args[1].exprType,
                            'bool') +
             ')';
    case "is":
      return "(" + this.args[0].gen() + " === " + this.args[1].gen() + ")";
    case "is not":
      return "(" + this.args[0].gen() + " !== " + this.args[1].gen() + ")";
    case '+=':
    case '-=':
    case '*=':
    case '/=':
    case '%=':
      return '(' +
             this.args[0].gen() + ' ' + this.op + ' ' +
             this.data.cast(this.args[1].gen(),
                            this.args[1].exprType,
                            this.args[0].exprType) +
             ')';
    case '++':
    case '--':
      return this.args[0].gen() + this.op;
    default:
      throw new TranspileError("Unrecognized special operator: " + this.op);
    }
  }
}

class New extends Expression {
  constructor(token, cls, args) {
    super(token);
    this.cls = cls;
    this.args = args;
  }
  ann(data) {
    for (const arg of this.args) {
      arg.ann(data);
    }
    this.exprType = this.cls;
    if (data.hasFunc(this.cls + ".__init__")) {
      const actualArgtypes = this.args.map(arg => arg.exprType);
      checkArgtypes(data, data.getArgtypes(this.cls + ".__init__"),
                    actualArgtypes);
    } else {
      if (this.args.length !== 0) {
        throw new TranspileError(
            this.cls + " has no constructor (__init__) but you gave it " +
            this.args.length + " args", [this.token]);
      }
      if (data.isNative(this.cls)) {
        throw new TranspileError(
            "Native class " + this.cls + " is not new constructible",
            [this.token]);
      }
    }
    this.data = data;
  }
  gen() {
    const name = this.cls + '.__init__';
    if (this.data.hasFunc(name)) {
      const args = castArgs(this.data, this.args,
                            this.data.getArgtypes(name));
      return 'new xx$' + this.cls + '(' + args.join(", ") + ')';
    } else {
      return 'new xx$' + this.cls + '()';
    }
  }
}

class Int extends Expression {
  constructor(token, val) {
    super(token);
    this.val = val;
  }
  ann(data) {
    this.exprType = 'int';
  }
  gen() {
    return this.val.toString();
  }
}

class Float extends Expression {
  constructor(token, val) {
    super(token);
    this.val = val;
  }
  ann(data) {
    this.exprType = 'float';
  }
  gen() {
    return this.val.toString();
  }
}

class Str extends Expression {
  constructor(token, val) {
    super(token);
    this.val = val;
  }
  ann(data) {
    this.exprType = 'string';
  }
  gen() {
    return '"' + sanitizeString(this.val) + '"';
  }
}

class ListDisplay extends Expression {
  constructor(token, exprs) {
    super(token);
    this.exprs = exprs;
  }
  ann(data) {
    for (const expr of this.exprs) {
      expr.ann(data);
    }
    this.exprType = 'List';
    this.data = data;
  }
  gen() {
    const args = this.exprs.map(expr =>
      this.data.cast(expr.gen(), expr.exprType, 'Object')).join(", ");
    return 'new xx$List([' + args + '])';
  }
}

class VectorDisplay extends Expression {
  constructor(token, cls, exprs) {
    super(token);
    this.cls = cls;
    this.exprs = exprs;
  }
  ann(data) {
    if (!this.cls) {
      throw new TranspileError(
          "Vector displays must start with a primitive type but got " +
          this.cls, [this.token]);
    }
    for (const expr of this.exprs) {
      expr.ann(data);
    }
    this.exprType = getWrapperType(this.cls) + 'Vector';
    this.data = data;
  }
  gen() {
    const args = this.exprs.map(expr =>
      this.data.cast(expr.gen(), expr.exprType, this.cls)).join(", ");
    return 'new xx$' + this.exprType + '([' + args + '])';
  }
}

class This extends Expression {
  ann(data) {
    this.exprType = data.getThisType();
    if (this.exprType === null) {
      throw new TranspileError("Tried to use 'this' outside a class",
                               [this.token]);
    }
  }
  gen() {
    return 'this';
  }
}

class Name extends Expression {
  constructor(token, name) {
    super(token);
    this.name = name;
  }
  ann(data) {
    this.exprType = data.getVarType(this.name, [this.token]);
  }
  gen() {
    return 'xx$' + this.name;
  }
}

class Lambda extends Expression {
  constructor(token, args, body) {
    super(token);
    this.args = args;  // [(type:string, name:string)]
    this.body = body;  // Block
  }
  ann(data) {
    data.pushVarstack();
    data.pushCurRettype('Object');
    for (const [type, arg] of this.args) {
      data.setVarType(arg, type);
    }
    this.body.ann(data);
    data.popVarstack();
    data.popCurRettype();
    this.exprType = 'Lambda';
  }
  gen() {
    const argtypes = [];
    const argnames = [];
    for (const [type, name] of this.args) {
      if (isPrimitive(type)) {
        argtypes.push('"' + type + '"');
      } else {
        argtypes.push('xx$' + type);
      }
      argnames.push('xx$' + name);
    }
    return 'new xx$Lambda([' + argtypes.join(", ") + '], ' +
           'function(' + argnames.join(", ") + ')' + this.body.gen() + ')';
  }
}

class Assign extends Expression {
  constructor(token, name, expr) {
    super(token);
    this.name = name;
    this.expr = expr;
  }
  ann(data) {
    this.expr.ann(data);
    this.exprType = data.getVarType(this.name, [this.token]);
    if (!data.castable(this.expr.exprType, this.exprType)) {
      throw new TranspileError(
          "Tried to assign " + this.expr.exprType + " to a " +
          this.exprType + " variable", [this.token]);
    }
    this.data = data;
  }
  gen() {
    return '(xx$' + this.name + ' = ' +
           this.data.cast(
              this.expr.gen(), this.expr.exprType, this.exprType) + ')';
  }
}

class GetAttr extends Expression {
  constructor(token, owner, name) {
    super(token);
    this.owner = owner;
    this.name = name;
  }
  ann(data) {
    this.owner.ann(data);
    this.exprType = data.getAttrType(this.owner.exprType, this.name);
  }
  gen() {
    return this.owner.gen() + '.xx$' + this.name;
  }
}

class SetAttr extends Expression {
  constructor(token, owner, name, expr) {
    super(token);
    this.owner = owner;
    this.name = name;
    this.expr = expr;
  }
  ann(data) {
    this.owner.ann(data);
    this.expr.ann(data);
    this.exprType = data.getAttrType(this.owner.exprType, this.name);
    if (!data.castable(this.expr.exprType, this.exprType)) {
      throw new TranspileError(
          this.owner.exprType + '.' + this.name + " is a " + this.exprType +
          " but tried to assign " + this.expr.exprType + " to it",
          [this.token]);
    }
    this.data = data;
  }
  gen() {
    return '(' + this.owner.gen() + '.xx$' + this.name + ' = ' +
           this.data.cast(
              this.expr.gen(), this.expr.exprType, this.exprType) + ')';
  }
}

const NATIVE_PRELUDE = `"use strict";

// BEGIN NATIVE_PRELUDE

var RuntimeError;

if (RuntimeError === undefined) {
  RuntimeError = Error;
}

function yy$getTraceMessageFromChromeStackTrace(stack) {
  /* Here's an example of the sort of thing I'm expecting:

  Error
    at xx$error (eval at run (/Users/math4tots/misc/GitHub/xx/v0.1/xx.js:2554:16), <anonymous>:17:9)
    at xx$assertWithMessage (eval at run (/Users/math4tots/misc/GitHub/xx/v0.1/xx.js:2554:16), <anonymous>:356:20)
    at xx$assert (eval at run (/Users/math4tots/misc/GitHub/xx/v0.1/xx.js:2554:16), <anonymous>:350:18)
    at xx$test0 (eval at run (/Users/math4tots/misc/GitHub/xx/v0.1/xx.js:2554:16), <anonymous>:390:18)
    at xx$main (eval at run (/Users/math4tots/misc/GitHub/xx/v0.1/xx.js:2554:16), <anonymous>:378:17)
    at eval (eval at run (/Users/math4tots/misc/GitHub/xx/v0.1/xx.js:2554:16), <anonymous>:410:1)
    at run (/Users/math4tots/misc/GitHub/xx/v0.1/xx.js:2557:8)
    at readAll (/Users/math4tots/misc/GitHub/xx/v0.1/runxx.js:30:6)
    at fs.readFile (/Users/math4tots/misc/GitHub/xx/v0.1/runxx.js:18:9)
    at tryToString (fs.js:449:3)

  */
  // (
  const pattern = /^\\s*at xx\\$(\\w+(?:\.xx\\$\\w+)?).*?(\\d+)\\:\\d+\\)?$/
  const lines = stack.split(/\\r?\\n/);
  let message = '\\nMost recent call last:';
  for (const line of Array.from(lines).reverse()) {
    if (pattern.test(line)) {
      const [_, funkyfuncname, jslineno] = pattern.exec(line);
      if (funkyfuncname === "Promise") {
        // HACK: when doing async stuff, a lot of "Promise" stuff
        // can really clutter up the stack. I'm afraid this hack
        // might catch some false positives...
        continue;
      }
      const parts = funkyfuncname.split("xx$");
      const funcname = parts[parts.length-1];
      const tag = yy$tagData[jslineno] || 'File ??????, line ???';
      message += '\\n  ' + tag + ', in ' + funcname;
    }
  }
  return message;
}

function xx$print(x) {
  console.log(x.toString());
}

function xx$error(x) {
  throw new RuntimeError(x);
}

function yy$dynamicCast(x, target) {
  if (x !== null && !(x instanceof target)) {
    throw new RuntimeError(
        x.constructor.name.slice(3) + " cannot be cast to " +
        target.name.slice(3));
  }
  return x;
}

function yy$startsWith(a, prefix) {
  return a.startsWith(prefix);
}

function yy$parseInt(str) {
  const result = parseInt(str);
  if (isNaN(result)) {
    throw new Error("Not an int string: " + str);
  }
  return result;
}

function yy$parseFloat(str) {
  const result = parseFloat(str);
  if (isNaN(result)) {
    throw new Error("Not a float string: " + str);
  }
  return result;
}

function xx$assertThrowWithMessage(f, message) {
  let thrown = false;
  let msg = "";
  try {
    f.xx$call(new xx$List([]));
  } catch (e) {
    if (e.stack) {
      msg = e.stack;
    } else {
      msg = "" + e;
    }
    thrown = true;
  }
  if (!thrown) {
    throw new Error("Expected throw " + message);
  }
  return msg;
}

const PRIMITIVE_TABLE = {
  void: 'Void', bool: 'Bool', float: 'Float', int: 'Int', string: 'String',
};

function yy$objectToMaybePrimitiveCast(x, target) {
  if (typeof target === 'string' && PRIMITIVE_TABLE[target]) {
    const className = x.getClassName();
    if (PRIMITIVE_TABLE[target] !== className) {
      throw new RuntimeError("Cannot cast " + className + " to " + target);
    }
    return x.val;
  } else {
    return yy$dynamicCast(x, target);
  }
}

let yy$nextObjectId = 1;

class xx$Object {
  constructor() {
    this.xx$__init__.apply(this, arguments);
  }
  yy$getId() {
    if (this.yy$_id === undefined) {
      this.yy$_id = yy$nextObjectId++;
    }
    return this.yy$_id;
  }
  xx$__init__() {}
  xx$__hash__() { return 0; }
  xx$__repr__() {
    return '<' + this.constructor.name.slice(3) + ' instance>';
  }
  xx$__str__() {
    return this.xx$__repr__();
  }
  xx$__ne__(other) {
    return !this.xx$__eq__(other);
  }
  xx$__lt__(other) {
    throw new RuntimeError(this.getClassName() + ".__lt__() not implemented");
  }
  xx$__le__(other) {
    return !other.xx$__lt__(this);
  }
  xx$__ge__(other) {
    return !this.xx$__lt__(other);
  }
  xx$__gt__(other) {
    return other.xx$__lt__(this);
  }
  xx$___len__() {
    throw new RuntimeError(
        this.getClassName() + ".__len__() not implemented");
  }
  toString() {
    return this.xx$__str__();
  }
  inspect() {
    return this.xx$__repr__();
  }
  getClassName() {
    return this.constructor.name.slice(3);
  }
}

// Not full fledged in any way.
// Since Promises don't have any specialized methods in xx
// (the only way to interact with them is await),
// I can take advantage of this to simplify the implementation.
// Semantics are a bit different -- whereas with A+ promises,
// the onReject handler of a 'then' does not get called, with these
// onReject will get called. Furthermore, 'then' does not return anything.
class xx$Promise extends xx$Object {
  constructor(resolver) {
    super();
    this._resolver = resolver;
    this._state = yy$STATE_PENDING;
    this._result = null;
    this._thenCalled = false;
    this._onResolve = null;
    this._onReject = null;
    resolver(
      result => this._resolve(result),
      reason => this._reject(reason));
  }
  _assertPending() {
    // In A+ promises you would ignore these instead of erroring out.
    if (this._state !== yy$STATE_PENDING) {
      console.error("resolver called resolve/reject more than once!");
      throw new Error("resolver called resolve/reject more than once!");
    }
  }
  _resolve(result) {
    this._assertPending();
    this._state = yy$STATE_FULFULLED;
    this._result = result;
    if (this._thenCalled) {
      this._onResolve(result);
    }
  }
  _reject(reason) {
    this._assertPending();
    this._state = yy$STATE_REJECTED;
    this._result = reason;
    // HACK: If _onReject hasn't been set yet, it's too easy for
    // exception to go unnoticed.
    if (!this._onReject) {
      throw reason;
    }
    this._onReject(reason);
  }
  then(onResolve, onReject) {
    if (this._thenCalled) {
      console.error("'then' called more than once!");
      throw new Error("'then' called more than once!");
    }
    this._onResolve = onResolve;
    this._onReject = onReject;
    if (this._state === yy$STATE_FULFULLED) {
      onResolve(this._result);
    } else if (this._state === yy$STATE_REJECTED) {
      onReject(this._result);
    }
    this._thenCalled = true;
  }
}

const yy$STATE_PENDING = 0;
const yy$STATE_FULFULLED = 1;
const yy$STATE_REJECTED = 2;

function yy$asyncf(generator) {
  return function() {
    const generatorObject = generator.apply(this, arguments);
    return new xx$Promise((resolve, reject) => {
      yy$asyncfHelper(generatorObject, resolve, reject);
    });
  };
}

function yy$asyncfHelper(generatorObject, resolve, reject, next, thr) {
  let value, done;
  try {
    if (thr) {
      ({value, done} = generatorObject.throw(next));
    } else {
      ({value, done} = generatorObject.next(next));
    }
  } catch (e) {
    try {
      reject(e);
      return;
    } catch (e2) {
      // TODO: I'm basically logging errors everywhere, and might start
      // causing clutter. Figure out where it's safe to remove logging
      // and still be confident that they won't be ignored.
      console.error(
        yy$exceptionToString(e2) + "\\n --- while handling ---\\n" +
        yy$exceptionToString(e));
    }
    return;
  }
  if (done) {
    resolve(value);
  } else {
    value.then(result => {
      yy$asyncfHelper(generatorObject, resolve, reject, result);
    }, err => {
      yy$asyncfHelper(generatorObject, resolve, reject, err, true);
    });
  }
}

function xx$asyncSleep(ms) {
  return new xx$Promise((resolve, reject) => {
    setTimeout(() => {
      resolve(null);
    }, ms);
  });
}

class xx$Lambda extends xx$Object {
  constructor(argtypes, f) {
    super();
    this.argtypes = argtypes;
    this.f = f;
  }
  xx$call(rawList) {
    const rawArgs = rawList.val;
    const args = [];
    const len = rawArgs.length;
    const argtypes = this.argtypes;
    if (argtypes.length !== len) {
      throw new RuntimeError(
          "Lambda expected " + argtypes.length + " but got " +
          len + " args");
    }
    for (let i = 0; i < len; i++) {
      args.push(yy$objectToMaybePrimitiveCast(rawArgs[i], argtypes[i]));
    }
    const result = this.f.apply(null, args);
    return result === undefined ? null : result;
  }
}

class yy$PrimitiveWrapperType extends xx$Object {
  constructor(val) {
    super();
    if (val === null) {
      throw new RuntimeError("Null pointer error when boxing primitive type");
    }
    this.val = val;
  }
  xx$__str__() {
    return this.xx$__repr__();
  }
  xx$__repr__() {
    return this.val.toString();
  }
  xx$__eq__(other) {
    return this.constructor === other.constructor &&
           this.val === other.val;
  }
}

class xx$Bool extends yy$PrimitiveWrapperType {}
const yy$true = new xx$Bool(true);
const yy$false = new xx$Bool(false);

const ESCAPE_TABLE = {
  n: '\\n',
  t: '\\t',
  r: '\\r',
  '"': '"',
  "'": "'",
};

const REVERSE_ESCAPE_TABLE = Object.create(null);
for (const key in ESCAPE_TABLE) {
  REVERSE_ESCAPE_TABLE[ESCAPE_TABLE[key]] = key;
}

function yy$str_getitem(s, i) {
  if (i < 0 || i >= s.length) {
    throw new RuntimeError(
        "Tried to string.__getitem__ out of bounds: " +
        " i = " + i + ", length = " + s.length);
  }
  return s[i];
}

function sanitizeString(str) {
  let newstr = '';
  for (const c of str) {
    if (REVERSE_ESCAPE_TABLE[c]) {
      newstr += '\\\\' + REVERSE_ESCAPE_TABLE[c];
    } else {
      newstr += c;
    }
  }
  return newstr;
}

function yy$str_repr(s) {
  return '"' + sanitizeString(s) + '"';
}

class xx$String extends yy$PrimitiveWrapperType {
  xx$__add__(str) {
    return new xx$String(this.val + str.val);
  }
  xx$__str__() {
    return this.val;
  }
  xx$__repr__() {
    return yy$str_repr(this.val);
  }
}

class xx$Int extends yy$PrimitiveWrapperType {
  xx$__lt__(other) {
    if (!(other instanceof xx$Int)) {
      throw new RuntimeError(
          "Int.__lt__ requires an Int arg but got " +
          other.getClassName());
    }
    return this.val < other.val;
  }
}

class xx$Float extends yy$PrimitiveWrapperType {
  xx$__lt__(other) {
    if (!(other instanceof xx$Float)) {
      throw new RuntimeError(
          "Float.__lt__ requires a Float arg but got " +
          other.getClassName());
    }
    return this.val < other.val;
  }
}

class yy$BaseList extends yy$PrimitiveWrapperType {
  xx$push(x) {
    this.val.push(x);
  }
  xx$pop() {
    if (this.val.length === 0) {
      throw new RuntimeError("Tried to pop from an empty List");
    }
    return this.val.pop();
  }
  xx$__eq__(other) {
    if (this.constructor !== other.constructor) {
      return false;
    }
    const a = this.val;
    const b = other.val;
    const len = a.length;
    if (len !== b.length) {
      return false;
    }
    for (let i = 0; i < len; i++) {
      if (!this.yy$areEqual(a[i], b[i])) {
        return false;
      }
    }
    return true;
  }
  xx$__iter__() {
    return new xx$ListIterator(this.val);
  }
  xx$__getitem__(index) {
    if (index < 0) {
      index += this.length;
    }
    if (index < 0 || index >= this.length) {
      throw new RuntimeError(
          "Tried to List/Vector.__getitem__ out of bounds: " +
          "i = " + index + ", length = " + this.length);
    }
    return this.val[index];
  }
  xx$__setitem__(index, value) {
    if (index < 0) {
      index += this.length;
    }
    if (index < 0 || index >= this.length) {
      throw new RuntimeError(
          "Tried to List/Vector.__setitem__ out of bounds: " +
          "i = " + index + ", length = " + this.length);
    }
    this.val[index] = value;
    return value;
  }
  xx$__len__() {
    return this.val.length;
  }
  xx$__repr__() {
    return '[' + this.val.map(arg => this.yy$inspect(arg)).join(", ") + ']';
  }
  xx$__contains__(x) {
    for (const y of this.val) {
      if (this.yy$areEqual(x, y)) {
        return true;
      }
    }
    return false;
  }
  xx$indexOf(x) {
    for (let i = 0; i < this.val.length; i++) {
      if (this.yy$areEqual(x, this.val[i])) {
        return i;
      }
    }
    throw new RuntimeError(this.yy$inspect(x) + " not in this List/Vector");
  }
  yy$inspect(x) {
    return x.xx$__repr__();
  }
  yy$areEqual(a, b) {
    return a.xx$__eq__(b);
  }
}

class yy$BaseListIterator extends xx$Object {
  constructor(list) {
    super();
    this.list = list;
    this.i = 0;
  }
  xx$__more__() {
    return this.i < this.list.length;
  }
  xx$__next__() {
    if (!this.xx$__more__()) {
      throw new RuntimeError(
          "Tried to call __next__ on a ListIterator when there was no " +
          "more left");
    }
    const item = this.list[this.i];
    this.i++;
    return item;
  }
}

class xx$List extends yy$BaseList {}
class xx$ListIterator extends yy$BaseListIterator {}

class yy$BaseVector extends yy$BaseList {
  xx$__repr__() {
    return this.yy$getItemTypeName() + super.xx$__repr__();
  }
  yy$inspect(x) { return x.toString(); }
  yy$areEqual(a, b) { return a === b; }
}

class xx$BoolVector extends yy$BaseVector {
  yy$getItemTypeName() { return 'bool'; }
}

class xx$IntVector extends yy$BaseVector {
  yy$getItemTypeName() { return 'int'; }
}

class xx$FloatVector extends yy$BaseVector {
  yy$getItemTypeName() { return 'float'; }
}

class xx$StringVector extends yy$BaseVector {
  yy$getItemTypeName() { return 'string'; }
  yy$inspect(x) { return yy$str_repr(x); }
}

function yy$exceptionToString(e) {
  return e.toString() + yy$getTraceMessageFromChromeStackTrace(e.stack) +
         (yy$shouldIncludeJavascriptStack() ? "\\n" + e.stack : "");
}

function yy$shouldIncludeJavascriptStack() {
  try {
    if (typeof includeJavascriptStack !== undefined &&
        !includeJavascriptStack) {
      return false;
    }
  } catch (_) {}
  return true;
}

function yy$main() {
  try {
    return xx$main();
  } catch (e) {
    throw new Error(yy$exceptionToString(e));
  }
}

// END NATIVE_PRELUDE
`;


const BUILTIN = `
native class Object {
  string __str__();
  string __repr__();
  int __hash__();
  bool __eq__(Object other);
  bool __ne__(Object other);
  bool __lt__(Object other);
  bool __le__(Object other);
  bool __gt__(Object other);
  bool __ge__(Object other);
}
native class Lambda extends Object {
  Object call(List args);
}
native class Error extends Object {
  void __init__(string message);
}
native class Int extends Object {
  Int __add__(Int other);
  Int __sub__(Int other);
  Int __div__(Int other);
  bool __eq__(Object other);
  string __repr__();
}
native class Float extends Object {
  Float __add__(Float other);
  Float __sub__(Float other);
  Float __div__(Float other);
  bool __eq__(Object other);
  string __repr__();
}
native class String extends Object {
  String __add__(String other);
  string __str__();
  string __repr__();
  bool __eq__(Object other);
  int __len__();
}
native class List extends Object {
  void push(Object x);
  Object pop();
  int __len__();
  Object __getitem__(int index);
  Object __setitem__(int index, Object value);
  string __repr__();
  bool __contains__(Object value);
  ListIterator __iter__();
}
// So I call this a Promise, but unlike javascript promises,
// there's no 'then' or 'catch' method.
// So how do you use them? The only thing you can do is
// 'await' them from inside an 'async' function.
// Writing custom resolvers can lead to undiscovered bugs
// e.g. resolver might call resolve/reject multiple times.
native class Promise extends Object {}
native class Iterator extends Object {
  bool __more__();
  Object __next__();
  Iterator __iter__();
}
native class ListIterator extends Iterator {
  ListIterator __iter__();
}
native class BoolVector extends Object {
  void push(bool x);
  bool pop();
  int __len__();
  bool __getitem__(int index);
  bool __setitem__(int index, bool value);
  string __repr__();
  bool __contains__(bool value);
}
native class IntVector extends Object {
  void push(int x);
  int pop();
  int __len__();
  int __getitem__(int index);
  int __setitem__(int index, int value);
  string __repr__();
  bool __contains__(int value);
}
native class FloatVector extends Object {
  void push(float x);
  float pop();
  int __len__();
  float __getitem__(int index);
  float __setitem__(int index, float value);
  string __repr__();
  bool __contains__(float value);
}
native class StringVector extends Object {
  void push(string x);
  string pop();
  int __len__();
  string __getitem__(int index);
  string __setitem__(int index, string value);
  string __repr__();
  bool __contains__(string value);
}

native void print(Object item);
native string input();
native void error(string message);

void assert(bool cond) {
  assertWithMessage(cond, 'assert error');
}

void assertWithMessage(bool cond, string message) {
  if (not cond) {
    error(message);
  }
}

native void runAsync(Promise promise);

native async void asyncSleep(int ms);

async void asyncMoment() {
  // For now, I use asyncSleep(0), which is based on setTimeout.
  // Unfortunately, setTimeout is "clamped" when you nest, so that
  // when nested, the minium timeout is set to 4ms by the HTML5 standard.
  // setImmediate is one way, but only available on node.js and IE
  // TODO: Explore the postMessage workaround for this.
  await asyncSleep(0);
}

void assertEqual(Object expected, Object actual) {
  assertEqualWithMessage(expected, actual, ' assertEqual error');
}

void assertEqualWithMessage(Object expected, Object actual, string message) {
  if (expected != actual) {
    error("Expected " + repr(expected) + " but got " + repr(actual) +
          message);
  }
}

native string assertThrowWithMessage(Lambda f, string message);

string assertThrow(Lambda f) {
  return assertThrowWithMessage(f, '');
}

`;

function extractTagData(transpiledCode, traceOffset) {
  traceOffset = traceOffset || 0;
  const lines = transpiledCode.split(/\r?\n/);
  const len = lines.length;
  const data = Object.create(null);
  const moduleTagPattern = /^\/\/TAG\:MODULE\:(.*?$)/;
  const stmtTagPattern = /^\s*\/\*TAG:STMT\:(\d+)/;
  let filename = null;
  for (let i = 0; i < len; i++) {
    const line = lines[i];
    if (moduleTagPattern.test(line)) {
      filename = moduleTagPattern.exec(line)[1];
    } else if (stmtTagPattern.test(line)) {
      const lineno = parseInt(stmtTagPattern.exec(line)[1]);
      data[i+1+traceOffset] =
          'File "' + filename.toString() + '", line ' + lineno;
    }
  }
  return data;
}

class CodeGenerator {
  constructor() {
    this._nativeModules = [];
    this._nativeModulesIndicator = Object.create(null);
    this._modules = Object.create(null);
    this._processed = false;
    this._tagTable = null;
    this._backupOffset = 0;
    this.addNativeModule("<native>", NATIVE_PRELUDE);
    this.addModule("<prelude>", BUILTIN);
  }
  moduleExists(uri) {
    return this._modules[uri] || this._nativeModulesIndicator[uri];
  }
  _assertModuleDoesNotExist(uri) {
    if (this.moduleExists(uri)) {
      throw new Error("Module with this uri already exists: " + uri);
    }
  }
  addNativeModule(uri, source) {
    this._assertModuleDoesNotExist(uri);
    this._nativeModules.push([uri, source]);
    this._nativeModulesIndicator[uri] = true;
  }
  addModule(uri, source) {
    this._assertModuleDoesNotExist(uri);
    this._modules[uri] = source;
  }
  setBackupOffset(offset) {
    // HACK: Unfortunately there's no simple way of getting line numbers in
    // chrome from within a statement. As a result, I can't always calculate
    // the required offset based on some arbitrary location in the source.
    // Furthermore, even if I try to align to beginning of the string I
    // generate, if I use "new Function", in the stack trace all the lines
    // are moved up one extra line. Don't know why, but it just does.
    // I wish I could make this go away, but for now it seems like it's
    // here to stay.
    this._backupOffset = offset;
  }
  process() {
    // NOTE: You need to re-process in order to update the return
    // values for 'getTagTable' and 'compile'.
    const data = new GrokData();
    const nativePart = this._nativeModules.map(
        x => "\n// native module: " + x[0] + "\n" + x[1]).join("");
    const modules = [];
    for (const uri in this._modules) {
      const code = this._modules[uri];
      modules.push(parse(code, uri));
    }
    for (const module of modules) {
      module.grok(data);
    }
    data.processInheritanceData();
    for (const module of modules) {
      module.ann(data);
    }
    if (data.getArgtypes("main").length !== 0) {
      throw new Error("'main' may not declare any arguments");
    }
    const concreteClasses =
        data.getLinearConcreteClassesList();
    // NOTE: "lineNumber" is for FF.
    // Otherwise I just guess based on offset hint.
    const transpiledCodeWithoutTagData =
        "const REF_LINE_NO = " +
            "(new Error().lineNumber || " + this._backupOffset + "+1) - 1" +
        nativePart +
        concreteClasses.map(cls => cls.genDecl()).join("") +
        modules.map(module => module.gen()).join("") +
        modules.map(module => module.gen2()).join("");
    const tagData = extractTagData(transpiledCodeWithoutTagData);
    const taggedLineNumbers = Object.keys(tagData);
    const tagDataString =
        "\nconst yy$tagData = Object.create(null)" +
        taggedLineNumbers.map(lineno =>
            "\nyy$tagData[" + lineno + "-REF_LINE_NO] = \"" +
                sanitizeString(tagData[lineno]) + "\";").join("");
    this._tagTable = tagData;
    this._result =
        transpiledCodeWithoutTagData + tagDataString + "\n\nyy$main();";
    this._processed = true;
  }
  getTagTable() {
    this._assertFinalized();
    return Object.create(this._tagTable);
  }
  compile() {
    this._assertFinalized();
    return this._result;
  }
  _assertFinalized() {
    if (!this._processed) {
      throw new Error("This CodeGenerator has not been processed yet");
    }
  }
  _assertNotFinalized() {
    if (this._processed) {
      throw new Error("This CodeGenerator has already been processed");
    }
  }
}

function transpile(codeUriPairs, uri, offset) {
  if (!Array.isArray(codeUriPairs)) {
    codeUriPairs = [[codeUriPairs, uri]];
  }
  const cg = new CodeGenerator();
  if (offset !== undefined) {
    cg.setBackupOffset(offset);
  }
  for (const [code, uri] of codeUriPairs) {
    cg.addModule(uri, code);
  }
  cg.process();
  return cg.compile();
}

function run(codeUriPairs, uri) {
  // TODO: When I use 'Function' instead of 'eval',
  // the stack trace extraction doesn't work properly without shifting
  // two lines down. This feels bad -- this whole stack trace thing is
  // based on fragile implementation details. Figure out a better solution.
  // I will also point out, if I comment out 'const func...' and
  // 'func.apply...' and replace it with just 'eval(javascriptProgram)',
  // the trace works just fine.
  const javascriptProgram = transpile(codeUriPairs, uri, -2);

  const optionNames = options.map(pair => pair[0]);
  const optionValues = options.map(pair => pair[1]);

  // NOTE: This is basically new Function here. Linters may miss it because
  // I'm using Function.prototype.bind
  const func = new (Function.prototype.bind.apply(
      Function, [null].concat(optionNames).concat([javascriptProgram])))();

  func.apply(null, optionValues);
}

class Runner {
  constructor() {
    this._cg = null;
    this._opts =  [
      ['console', console],
      ['includeJavascriptStack', true],
      ['RuntimeError', RuntimeError],
      ['includeStackTrace', true],
    ];
  }
  setCodeGenerator(cg) {
    this._cg = cg;
  }
  setOption(key, value) {
    const len = this._opts.length;
    for (let i = 0; i < len; i++) {
      if (this._opts[i][0] === key) {
        this._opts[i][1] = value;
        return;
      }
    }
    throw new ConfigurationError('No such option: ' + key);
  }
  getOption(key) {
    const len = this._opts.length;
    for (let i = 0; i < len; i++) {
      if (this._opts[i][0] === key) {
        return this._opts[i][1];
      }
    }
    throw new ConfigurationError('No such option: ' + key);
  }
  run() {
    // TODO: When I use 'Function' instead of 'eval',
    // the stack trace extraction doesn't work properly without shifting
    // two lines down. This feels bad -- this whole stack trace thing is
    // based on fragile implementation details. Figure out a better solution.
    // I will also point out, if I comment out 'const func...' and
    // 'func.apply...' and replace it with just 'eval(javascriptProgram)',
    // the trace works just fine.
    if (this._cg === null) {
      throw new Error(
          "You must call 'setCodeGenerator' before calling 'run'");
    }
    this._cg.setBackupOffset(-2);
    this._cg.process();
    const javascriptProgram = this._cg.compile();

    const optionNames = this._opts.map(pair => pair[0]);
    const optionValues = this._opts.map(pair => pair[1]);

    // NOTE: This is basically new Function here. Linters may miss it because
    // I'm using Function.prototype.bind
    const func = new (Function.prototype.bind.apply(
        Function, [null].concat(optionNames).concat([javascriptProgram])))();

    func.apply(null, optionValues);
  }
}

exports.CodeGenerator = CodeGenerator;
exports.Runner = Runner;
exports.TranspileError = TranspileError;
exports.ConfigurationError = ConfigurationError;
exports.RuntimeError = RuntimeError;
})(xx);

(function() {
try {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = xx;
  }
} catch (e) {}
})();

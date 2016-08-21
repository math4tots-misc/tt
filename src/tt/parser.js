
const err = require("./err.js");
const lexer = require("./lexer.js");
const type = require("./type.js");
const typet = require("./typet.js");

const CompileError = err.CompileError;
const lex = lexer.lex;
const Typename = type.Typename;
const TypeTemplate = typet.TypeTemplate;
const TypenameTemplate = typet.TypenameTemplate;
const SymbolTypeTemplate = typet.SymbolTypeTemplate;
const TemplateTypeTemplate = typet.TemplateTypeTemplate;
const VariableTypeTemplate = typet.VariableTypeTemplate;
const openParen = lexer.openParen;
const closeParen = lexer.closeParen;
const openBracket = lexer.openBracket;
const closeBracket = lexer.closeBracket;
const openBrace = lexer.openBrace;
const closeBrace = lexer.closeBrace;

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
      if (this.at("class") && this.at("fn", 1)) {
        const token = this.expect("class");
        this.expect("fn");
        const methodtempl = new SymbolTypeTemplate(token, "Method");
        const typetempl = this.parseTypeTemplate();
        this.expect(openBrace);
        while (!this.consume(closeBrace)) {
          const functemp = this.parseFunctionTemplate();
          functemp.args.unshift(["this", typetempl]);
          functemp.args.unshift([null, methodtempl]);
          functemps.push(functemp);
        }
      } else if (this.at("static") || this.at("fn")) {
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
    const isAbstract = !!this.consume("abstract");
    if (isAbstract && isNative) {
      throw new CompileError(
          "Native classes can't also be abstract", [token]);
    }
    const pattern = this.parseTypeTemplate();
    let attrs = null;
    let nativeAnnotation = null;
    if (isAbstract) {
      this.expect(";");
    } else if (isNative) {
      nativeAnnotation = this.expect("STRING").val;
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
      "isAbstract": isAbstract,
      "pattern": pattern,
      "attrs": attrs,
      "nativeAnnotation": nativeAnnotation,
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
      return new SymbolTypeTemplate(
          token,
          (this.consume("NAME") ||
           this.consume("INT") ||
           this.expect("TYPENAME")).val);
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
    } else if (this.at("let") || this.at("final") || this.at("auto")) {
      const isAuto = !!this.consume("auto");
      const isFinal = isAuto || !!this.consume("final");
      if (!isFinal) {
        this.expect("let");
      }
      const name = this.expect("NAME").val;
      const cls = this.at("=") ? null : this.parseTypeTemplate();
      if (!this.at("=")) {
        throw new CompileError("Variables must be initialized!", [token]);
      }
      this.expect("=");
      const val = this.parseExpressionTemplate();
      this.expect(";");
      return {
        "type": "DeclarationTemplate",
        "token": token,
        "isAuto": isAuto,
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
      if (this.at("NAME")) {
        const name = this.expect("NAME").val;
        this.expect("in");
        const iter = this.parseExpressionTemplate();
        const body = this.parseBlockTemplate();
        return {
          "type": "ForInTemplate",
          "token": token,
          "name": name,
          "iter": iter,
          "body": body,
        };
      }
      this.expect(openParen);
      const init = this.parseStatementTemplate();
      if (init.type !== "DeclarationTemplate" &&
          init.type !== "ExpressionStatementTemplate") {
        throw new CompileError(
            "The initializer of a for statement must be a declaration or " +
            "an expression", [init.token]);
      }
      if (init.type === "DeclarationTemplate" && init.isAuto) {
        throw new CompileError(
            "The initializer of a for statement cannot be auto",
            [init.token]);
      }
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
    const argkeys = [];
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
      if (this.at("NAME") && this.at(":", 1)) {
        argkeys.push(this.expect("NAME").val);
        this.expect(":");
      } else {
        argkeys.push(null);
      }
      exprs.push(this.parseExpressionTemplate());
      if (!this.at(close)) {
        this.expect(",");
      }
    }
    exprs.argkeys = argkeys;
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
        const rhs = this.parseAdditiveTemplate();
        return makeFunctionCallTemplate(token, "__isnot__", [expr, rhs]);
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
          args.argkeys.unshift(null);
          args.argkeys.unshift(null);
          expr = makeFunctionCallTemplate(token, name, args,
                                          args.varexpr, args.argkeys);
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
        return makeFunctionCallTemplate(token, token.val, args,
                                        args.varexpr,
                                        args.argkeys);
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
      if (exprs.argkeys.some(key => key !== null)) {
        throw new CompileError(
            "List displays can't have keyword arguments", [token]);
      }
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

function makeFunctionCallTemplate(token, name, exprs, varexpr, argkeys) {
  return {
    "type": "FunctionCallTemplate",
    "token": token,
    "name": name,
    "exprs": exprs,
    "varexpr": varexpr || null,
    "argkeys": argkeys || null,
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

exports.parseModule = parseModule;
exports.makeFunctionCallTemplate = makeFunctionCallTemplate;


class Ast {
  constructor(frame) {
    this.frame = frame;  // InstantiationFrame
  }
}

class Program {
  constructor(decls, clss, stats, funcs) {
    this.decls = decls;
    this.clss = clss;
    this.stats = stats;
    this.funcs = funcs;
  }
}

class Function extends Ast {
  constructor(frame, isNative, name, args, ret, body) {
    super(frame);
    this.isNative = isNative;  // bool
    this.name = name;  // NAME
    this.args = args;  // [(NAME, Type)]
    this.ret = ret;  // Type
    this.body = body;  // javascript|Block
  }
}

class Class extends Ast {
  constructor(frame, type, isNative, name, attrs) {
    super(frame);
    this.type = type;  // Type
    this.isNative = isNative;  // bool
    this.name = name;  // NAME
    this.attrs = attrs;  // [(NAME, Type)]
  }
}

class Statement extends Ast {}

class Block extends Statement {
  constructor(frame, stmts) {
    super(frame);
    this.stmts = stmts;  // [Statement]
  }
}

class ExpressionStatement extends Statement {
  constructor(frame, expr) {
    super(frame);
    this.expr = expr;  // Expression
  }
}

class Expression extends Ast {
  constructor(frame, exprType) {
    super(frame);
    this.exprType = exprType;  // Type
  }
}

class FunctionCall extends Expression {
  constructor(frame, exprType, name, exprs) {
    super(frame, exprType);
    this.name = name;  // NAME
    this.exprs = exprs;  // [Expression]
  }
}



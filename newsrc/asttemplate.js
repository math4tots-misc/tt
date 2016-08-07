class ProgramTemplate {
  constructor(modtemps) {
    this.functemps = [];
    this.clstemps = [];
    this.statictemps = [];
    for (const modtemp of modtemps) {
      for (const functemp of modtemp.functemps) {
        this.functemps.push(functemp);
      }
      for (const clstemp of modtemp.clstemps) {
        this.clstemps.push(clstemp);
      }
      for (const statictemp of modtemp.statictemps) {
        this.statictemps.push(statictemp);
      }
    }
  }
}

class AstTemplate {
  constructor(token) {
    this.token = token;
  }
}

class ModuleTemplate extends AstTemplate {
  constructor(token, functemps, clstemps, statictemps) {
    super(token);
    this.functemps = functemps;  // [FunctionTemplate]
    this.clstemps = clstemps;  // [ClassTemplate]
    this.statictemps = statictemps;  // [StaticTemplate]
  }
}

class FunctionTemplate extends AstTemplate {
  constructor(token, isNative, name, arglist, ret, body) {
    super(token);
    this.isNative = isNative;  // bool
    this.name = name;  // NAME
    this.arglist = arglist;  // TemplateArgumentList
    this.ret = ret;  // TypeTemplate
    this.body = body;  // javascript|StatementTemplate
  }
}

class ClassTemplate extends AstTemplate {
  constructor(token, isNative, name, args, attrs) {
    super(token);
    this.isNative = isNative;  // bool
    this.name = name;  // TYPENAME
    this.args = args;  // TemplateTypeList
    this.attrs = attrs;  // null|[(NAME, Type)]
  }
}




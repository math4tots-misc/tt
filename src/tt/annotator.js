// annotator.js

// TODO: Interfaces and Template-interfaces

const err = require("./err.js");
const parser = require("./parser.js");
const type = require("./type.js");
const typet = require("./typet.js");

const CompileError = err.CompileError;
const InstantiationError = err.InstantiationError;
const InstantiationFrame = err.InstantiationFrame;
const makeFunctionCallTemplate = parser.makeFunctionCallTemplate;
const parseModule = parser.parseModule;
const Typename = type.Typename;
const SymbolType = type.SymbolType;
const TemplateType = type.TemplateType;
const TypeTemplate = typet.TypeTemplate;
const TypenameTemplate = typet.TypenameTemplate;
const SymbolTypeTemplate = typet.SymbolTypeTemplate;
const TemplateTypeTemplate = typet.TemplateTypeTemplate;
const VariableTypeTemplate = typet.VariableTypeTemplate;

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
  const functempsByName = Object.create(null);
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

  for (const functemp of functemps) {
    if (!functempsByName[functemp.name]) {
      functempsByName[functemp.name] = [];
    }
    functempsByName[functemp.name].push(functemp);
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

  function pushScopeFinalsOnly() {
    scopeStack.push(scope);
    const newScope = Object.create(null);
    for (key in scope) {
      if (scope[key].isFinal) {
        newScope[key] = scope[key];
      }
    }
    scope = Object.create(newScope);
  }

  function popScope() {
    scope = scopeStack.pop();
  }

  function getVariableType(name, stack) {
    if (!scope[name]) {
      throw new InstantiationError("No such variable " + name, stack);
    }
    return scope[name].type;
  }

  function isVariableFinal(name) {
    return scope[name].isFinal;
  }

  function declareVariable(name, isFinal, type, frames) {
    if (Object.hasOwnProperty.apply(scope, [name])) {
      throw new InstantiationError(
          "Variable " + name + " already declared in scope", frames);
    }
    scope[name] = {"type": type, "isFinal": isFinal};
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
    if (!classtemp.isNative && !classtemp.isAbstract) {
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
      "isAbstract": classtemp.isAbstract,
      "pattern": cls,
      "template": classtemp,
      "bindings": bindings,
      "attrs": attrs,
      "nativeAnnotation": classtemp.nativeAnnotation,
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
        if (varargname === null) {
          args.push([null, argtypes[i]]);
        } else {
          args.push([varargname + "__" + j, argtypes[i]]);
        }
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
            argnames[i], false,
            args[i][1], [frame].concat(flatten(stack)));
      }
    }
    if (functemp.vararg) {
      const varargname = functemp.vararg[0];
      const types = [];
      for (let i = argnames.length; i < argtypes.length; i++) {
        types.push(argtypes[i]);
      }
      declareVariable("..." + varargname, false, types,
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
      } else if (!body.maybeReturns.equals(bodyret)) {
        throw new InstantiationError(
            "Expected " + bodyret.toString() + " return type, but got " +
            body.maybeReturns.toString(),
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
      const val = resolveExpression(node.val, bindings, stack);
      const cls = node.cls === null ?
          val.exprType : resolveTypeTemplate(node.cls, bindings);
      const frame = new InstantiationFrame(
          node.token, currentInstantiationContext);
      if (!val.exprType.equals(cls)) {
        throw new InstantiationError(
            "Expected " + cls.toString() + " but got an expression of " +
            "type " + val.toString(), [frame].concat(flatten(stack)));
      }
      if (node.isAuto) {
        // Instantiate the delete function for this variable so that
        // it is available for the code generator to use.
        queueFunctionInstantiation("delete", [cls], [frame, stack]);
      }
      declareVariable(
          node.name, node.isFinal, cls, [frame].concat(flatten(stack)));
      return {
        "type": "Declaration",
        "token": node.token,
        "isAuto": node.isAuto,
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
      const init = node.init === null ?
                   null : resolveStatement(node.init, bindings, stack);
      const cond = node.init === null ?
                   null : resolveExpression(node.cond, bindings, stack);
      const frame = new InstantiationFrame(
          node.token, currentInstantiationContext);
      if (!cond.exprType.equals(newTypename("Bool"))) {
        throw new InstantiationError(
            "For loop condition must return a bool but got " +
            cond.exprType.toString(), [frame].concat(flatten(stack)));
      }
      const incr = node.incr === null ?
                   null : resolveExpression(node.incr, bindings, stack);
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
    case "ForInTemplate": {
      return resolveStatement({
        "type": "ForTemplate",
        "token": node.token,
        "init": {
          "type": "DeclarationTemplate",
          "token": node.token,
          "isAuto": false,
          "isFinal": false,
          "name": "__iter",
          "cls": null,
          "val": makeFunctionCallTemplate(node.token, "iter", [
              node.iter,
          ]),
        },
        "cond": makeFunctionCallTemplate(node.token, "hasNext", [{
          "type": "NameTemplate",
          "token": node.token,
          "name": "__iter",
        }]),
        "incr": null,
        "body": {
          "type": "BlockTemplate",
          "token": node.token,
          "stmts": [
            {
              "type": "DeclarationTemplate",
              "token": node.token,
              "isAuto": false,
              "isFinal": false,
              "name": node.name,
              "cls": null,
              "val": makeFunctionCallTemplate(node.token, "next", [{
                "type": "NameTemplate",
                "token": node.token,
                "name": "__iter",
              }]),
            },
            node.body,
          ],
        },
      }, bindings, stack);
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

  function isValidMallocArgtypes(argtypes, args, frame, stack) {
    if (argtypes.length === 0) {
      return false;
    }
    const type = argtypes[0];
    if (type instanceof SymbolType) {
      return false;
    }
    const classtemp = findMatchingClassTemplate(type);
    if (classtemp === null) {
      return false;
    }
    if (classtemp.isNative || classtemp.isAbstract) {
      return false;
    }
    if (argtypes.length-1 !== classtemp.attrs.length) {
      return false;
    }
    const cls = instantiateClass(type);
    for (let i = 0; i < argtypes.length-1; i++) {
      const actualType = argtypes[i+1];
      const expectedType = cls.attrs[i][1];
      if (!actualType.equals(expectedType)) {
        return false;
      }
      if (isTypeExpression(args[i+1])) {
        throw new InstantiationError(
            "Expected value expression for " + (i+1) + " argument, " +
            "but got type expression",
            [frame].concat(flatten(stack)));
      }
    }
    return cls;
  }

  function isTypeExpression(node) {
    return node.type === "TypeExpression";
  }

  function resolveValueOrTypeExpression(node, bindings, stack) {
    const frame =
        new InstantiationFrame(node.token, currentInstantiationContext);
    switch(node.type) {
    case "FunctionCallTemplate":
      const name = node.name;
      const args = resolveExpressionList(node, bindings, stack);
      const argtypes = args.map(arg => arg.exprType);
      const argkeys = node.argkeys;

      if (argkeys !== null) {
        while (argkeys.length < args.length) {
          argkeys.push(null);
        }
      }

      // HACK: If I had more mature meta-programming facilities, I could
      // cleanly implement malloc in the language itself as native
      // function.
      if (name === "malloc") {
        const cls = isValidMallocArgtypes(argtypes, args, frame, stack);
        if (cls) {
          const functemp = findMatchingFunctionTemplate(name, argtypes);
          if (functemp) {
            throw new InstantiationError(
                "User defined malloc function shadows the builtin malloc" +
                functemp.token.getLocationMessage(),
                [frame].concat(flatten(stack)));
          }
          args.shift();
          return {
            "type": "Malloc",
            "token": node.token,
            "args": args,
            "attrnames": cls.attrs.map(attr => attr[0]),
            "exprType": argtypes[0],
          };
        }
      }
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
        if (argkeys !== null && argkeys[i] !== null &&
            argkeys[i] !== functemp.args[i][0]) {
          throw new InstantiationError(
              "Keyword argument mismatch, expected '" + functemp.args[i][0] +
              "' but got '" + argkeys[i] + "' " +
              functemp.token.getLocationMessage(),
              [frame].concat(flatten(stack)));
        }
      }

      if (functemp.vararg) {
        // Here we check that if the vararg argument signature indicates
        // a value expression, we make sure that we get a type expression.
        const [name, type] = functemp.vararg;
        if (name) {
          for (let i = functemp.args.length; i < args.length; i++) {
            if (isTypeExpression(args[i])) {
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
      const type = getAttributeTypeOrNull(owner.exprType, node.name);
      if (type === null) {
        return resolveExpression(makeFunctionCallTemplate(
          node.token, "getattr", [
            node.owner,
            {
              "type": "TypeExpressionTemplate",
              "token": node.token,
              "cls": new SymbolTypeTemplate(node.token, node.name),
            },
          ]
        ), bindings, stack);
      }
      return {
        "type": "GetAttribute",
        "token": node.token,
        "owner": owner,
        "name": node.name,
        "exprType": type,
      };
    }
    case "SetAttributeTemplate": {
      const owner = resolveExpression(node.owner, bindings, stack);
      const val = resolveExpression(node.val, bindings, stack);
      const exprType = getAttributeTypeOrNull(owner.exprType, node.name);
      if (exprType === null) {
        return resolveExpression(makeFunctionCallTemplate(
          node.token, "setattr", [
            node.owner,
            {
              "type": "TypeExpressionTemplate",
              "token": node.token,
              "cls": new SymbolTypeTemplate(node.token, node.name),
            },
            node.val,
          ]
        ), bindings, stack);
      }
      if (!exprType.equals(val.exprType)) {
        throw new InstantiationError(
            owner.exprType + "." + node.name + " is type " + exprType +
            " but expression is of type " + val.exprType,
            [frame].concat(flatten(stack)));
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
      if (isVariableFinal(node.name)) {
        throw new InstantiationError(
            "Tried to assign to final variable '" + node.name + "'",
            [frame].concat(flatten(stack)));
      }
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
      if (isVariableFinal(node.name)) {
        throw new InstantiationError(
            "You can't Augassign a final variable '" + node.name + "'",
            [frame].concat(flatten(stack)));
      }
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
      pushScopeFinalsOnly();
      for (const [argname, argtypetemp] of node.args) {
        const argtype = resolveTypeTemplate(argtypetemp, bindings);
        args.push([argname, argtype]);
        declareVariable(
          argname, false, argtype, [frame].concat(flatten(stack)));
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
          declareVariable(key, false, types[i],
                          [frame].concat(flatten(stack)));
        }
        declareVariable(
            "..." + name, false, types, [frame].concat(flatten(stack)));
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

  function getAttributeTypeOrNull(type, name) {
    const cls = instantiateClass(type);
    if (cls === null || cls.attrs === null) {
      return null;
    }
    for (const [n, t] of cls.attrs) {
      if (name === n) {
        return t;
      }
    }
    return null;
  }

  function getAttributeType(type, name, frame, stack) {
    const ret = getAttributeTypeOrNull(type, name);
    if (ret === null) {
      throw new InstantiationError(
          "No such attribute: " + type + "." + name,
          [frame].concat(flatten(stack)));
    }
    return ret;
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
      for (const functemp of (functempsByName[name] || [])) {
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

function parseAndAnnotate(uriTextPairs, printCompileTimes) {
  const mods = [];
  const parseStart = Date.now();
  for (const [uri, text] of uriTextPairs) {
    mods.push(parseModule(uri, text));
  }
  if (printCompileTimes) {
    console.error("Parsing took: " + (Date.now()-parseStart) + "ms");
  }
  const start = Date.now();
  const result = annotate(mods);
  if (printCompileTimes) {
    console.error("Annotating took: " + (Date.now()-parseStart) + "ms");
  }
  return result;
}


exports.serializeFunctionInstantiation = serializeFunctionInstantiation;
exports.annotate = annotate;
exports.parseAndAnnotate = parseAndAnnotate;

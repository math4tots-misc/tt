// Autogenerated by the tt->js compiler
(function() {
"use strict";
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
  let message = "\nMost recent call last:";
  for (const tag of stack) {
    const [funcname, uri, lineno] = tagList[tag].split("@");
    message += "\n  " + padstr(funcname, 20) +
               "in " + padstr("'" + uri + "'", 20) +
               "line " + padstr(lineno, 5);
  }
  return message;
}
function tryAndCatch(f, stack) {
  stack = stack || [];
  try {
    f(stack);
  } catch (e) {
    console.error(getStackTraceMessage(stack).trim());
    throw e;
  }
}
function asyncf(generator) {
  return function() {
    const oldStack = arguments[0];
    // When starting a new async context, we need to make a copy of the
    // old stack, since there could potentially be multiple async contexts
    // started before being 'await'ed on.
    const newStack = Array.from(oldStack);
    const args = [newStack];
    for (let i = 1; i < arguments.length; i++) {
      args.push(arguments[i]);
    }
    const generatorObject = generator.apply(null, args);
    return new Promise((resolve, reject) => {
      asyncfHelper(oldStack, newStack, generatorObject, resolve, reject);
    });
  }
}
function asyncfHelper(
    oldStack, newStack, generatorObject, resolve, reject, val, thr) {
  // If we are resuming the generator throw, it means that we are the focus
  // of this generator's context.
  // In particular, if we are resuming by throwing, we want to replace the
  // contents of oldStack with newStack, so that whoever catches the
  // exception will be able to see the state of the call stack when the
  // exception happened.
  if (thr) {
    oldStack.splice(0, oldStack.length);
    for (const frame of newStack) {
      oldStack.push(frame);
    }
  }
  const {value, done} =
      thr ? generatorObject.throw(val) : generatorObject.next(val);
  if (done) {
    resolve(value);
  } else {
    value.then(val => {
      asyncfHelper(oldStack, newStack, generatorObject, resolve, reject, val);
    }).catch(error => {
      asyncfHelper(
          oldStack, newStack, generatorObject, resolve, reject, error, true);
    });
  }
}
//// End native prelude
// --- global variable declarations ---
let var_globalInt = 0;
let var_globalFloat = 0.0;
let var_valueChangedByStaticBlock = "hello world";
let var_valueChangedByNativeStaticBlock = "hello world";
// --- function definitions ---

function staticBlock__0__$1(stack) /*Void*/
{
  let var_varThatShouldNotClashWithOtherStaticBlock = 77;
  (stack.push(0),pop(stack,assertEqual__$5(stack,var_valueChangedByStaticBlock,"hello world")));
  (stack.push(1),pop(stack,(var_valueChangedByStaticBlock = "new value")));
}

function staticBlock__1__$2(stack) /*Void*/
{
  let var_varThatShouldNotClashWithOtherStaticBlock = 88;
}

// native function: staticBlock__2()Void
function staticBlock__2__$3(stack) /*Void*/
{
  var_valueChangedByNativeStaticBlock =
      "new value set by native static block";

}

function main__$4(stack) /*Void*/
{
  {
    (stack.push(2),pop(stack,assert__$6(stack,true)));
    (stack.push(3),pop(stack,assertFalse__$7(stack,false)));
    (stack.push(4),pop(stack,assertFalse__$7(stack,logicalNot__$8(stack,true))));
    (stack.push(5),pop(stack,assert__$6(stack,equals__$9(stack,1,1))));
    (stack.push(6),pop(stack,assertFalse__$7(stack,equals__$9(stack,1,2))));
    (stack.push(7),pop(stack,assertFalse__$7(stack,notEquals__$10(stack,1,1))));
    (stack.push(8),pop(stack,assert__$6(stack,notEquals__$10(stack,1,2))));
    (stack.push(9),pop(stack,assert__$6(stack,equals__$9(stack,add__$11(stack,2,2),4))));
    (stack.push(10),pop(stack,assertEqual__$12(stack,add__$11(stack,2,2),4)));
    (stack.push(11),pop(stack,assertEqual__$5(stack,repr__$13(stack,24),"24")));
    (stack.push(12),pop(stack,assertEqual__$5(stack,"hi","hi")));
  }
  {
    (stack.push(13),pop(stack,"\
        Make sure that strings can be used as statement-level comments.\
        "));
    (stack.push(14),pop(stack,assertEqual__$5(stack,add__$14(stack,"\\","n"),"\\n")));
    (stack.push(15),pop(stack,assertEqual__$5(stack,add__$14(stack,"\\","n"),"\\n")));
    (stack.push(16),pop(stack,assert__$6(stack,notEquals__$15(stack,add__$14(stack,"\\","n"),"\
    "))));
  }
  {
    let var_i = 0;
    (stack.push(17),pop(stack,assertEqual__$12(stack,var_i,0)));
    let var_s = '';
    (stack.push(18),pop(stack,assertEqual__$5(stack,var_s,"")));
    (stack.push(19),pop(stack,assertEqual__$12(stack,var_globalInt,0)));
    (stack.push(20),pop(stack,assertEqual__$16(stack,var_globalFloat,0.0)));
  }
  {
    const var_sample = malloc__$17(stack,undefined);
    (stack.push(21),pop(stack,assertEqual__$12(stack,var_sample.aat,0)));
    (stack.push(22),pop(stack,var_sample.aat = 15));
    (stack.push(23),pop(stack,assertEqual__$12(stack,var_sample.aat,15)));
  }
  {
    (stack.push(24),pop(stack,assertEqual__$12(stack,sum__$18(stack,1,2,3),6)));
    (stack.push(25),pop(stack,assertEqual__$5(stack,concatTypenames__$19(stack,undefined,undefined,undefined),"Int,Float,String")));
    (stack.push(26),pop(stack,assertEqual__$21(stack,makeList__$20(stack,5,6,7,8),[5,6,7,8])));
  }
  {
    (stack.push(27),pop(stack,assertEqual__$5(stack,var_valueChangedByStaticBlock,"new value")));
    (stack.push(28),pop(stack,assertEqual__$5(stack,var_valueChangedByNativeStaticBlock,"new value set by native static block")));
  }
  {
    (stack.push(29),pop(stack,assertEqual__$23(stack,tuple__$22(stack,1,"hi"),tuple__$22(stack,1,"hi"))));
    (stack.push(30),pop(stack,assertFalse__$7(stack,equals__$24(stack,tuple__$22(stack,1,"hi"),tuple__$22(stack,1,"hix")))));
    let var_t = tuple__$25(stack,1.0,2,"world");
    (stack.push(31),pop(stack,assertEqual__$5(stack,typestr__$26(stack,var_t),"Tuple[Float,Int,String]")));
    (stack.push(32),pop(stack,assertEqual__$16(stack,var_t.aax0,1.0)));
    (stack.push(33),pop(stack,assertEqual__$12(stack,var_t.aax1,2)));
    (stack.push(34),pop(stack,assertEqual__$5(stack,var_t.aax2,"world")));
    (stack.push(35),pop(stack,var_t.aax0 = 5.0));
    (stack.push(36),pop(stack,assertEqual__$16(stack,var_t.aax0,5.0)));
  }
  {
    const var_f = ((stack, var_a/*Int*/, var_b/*Int*/) => 
    {
      return (stack.push(37),pop(stack,add__$14(stack,"a + b = ",str__$27(stack,add__$11(stack,var_a,var_b)))));
    });
    (stack.push(38),pop(stack,assertEqual__$5(stack,repr__$28(stack,var_f),"<Lambda[String,Int,Int] instance>")));
    (stack.push(39),pop(stack,assertEqual__$5(stack,call__$29(stack,var_f,5,7),"a + b = 12")));
    const var_g = makeLambda__$30(stack,undefined,undefined,undefined);
    (stack.push(40),pop(stack,assertEqual__$5(stack,repr__$31(stack,var_g),"<Lambda[Int,Int,Float,String] instance>")));
    (stack.push(41),pop(stack,assertEqual__$12(stack,call__$32(stack,var_g,0,0.0,""),5)));
  }
  {
    (stack.push(42),pop(stack,asyncFunction__$33(stack)));
  }
  (stack.push(43),pop(stack,print__$34(stack,"Tests pass!")));
}

function assertEqual__$5(stack, var_left/*String*/, var_right/*String*/) /*Void*/
{
  if (notEquals__$15(stack,var_left,var_right))
  {
    (stack.push(44),pop(stack,error__$36(stack,add__$14(stack,add__$14(stack,add__$14(stack,"Expected ",repr__$35(stack,var_left))," == "),repr__$35(stack,var_right)))));
  }
}

function assert__$6(stack, var_cond/*Bool*/) /*Void*/
{
  if (logicalNot__$8(stack,var_cond))
  {
    (stack.push(45),pop(stack,error__$36(stack,"Assert error")));
  }
}

function assertFalse__$7(stack, var_cond/*Bool*/) /*Void*/
{
  (stack.push(46),pop(stack,assert__$6(stack,logicalNot__$8(stack,var_cond))));
}

// native function: logicalNot(Bool)Bool
function logicalNot__$8(stack, var_x/*Bool*/) /*Bool*/
{
  return !var_x;

}

function equals__$9(stack, var_x/*Int*/, var_y/*Int*/) /*Bool*/
{
  return (stack.push(47),pop(stack,isSameAs__$37(stack,var_x,var_y)));
}

function notEquals__$10(stack, var_x/*Int*/, var_y/*Int*/) /*Bool*/
{
  return (stack.push(48),pop(stack,logicalNot__$8(stack,equals__$9(stack,var_x,var_y))));
}

// native function: add(Int,Int)Int
function add__$11(stack, var_x/*Int*/, var_y/*Int*/) /*Int*/
{
  return var_x + var_y;

}

function assertEqual__$12(stack, var_left/*Int*/, var_right/*Int*/) /*Void*/
{
  if (notEquals__$10(stack,var_left,var_right))
  {
    (stack.push(49),pop(stack,error__$36(stack,add__$14(stack,add__$14(stack,add__$14(stack,"Expected ",repr__$13(stack,var_left))," == "),repr__$13(stack,var_right)))));
  }
}

// native function: repr(Int)String
function repr__$13(stack, var_x/*Int*/) /*String*/
{
  return "" + var_x;

}

// native function: add(String,String)String
function add__$14(stack, var_x/*String*/, var_y/*String*/) /*String*/
{
  return var_x + var_y;

}

function notEquals__$15(stack, var_x/*String*/, var_y/*String*/) /*Bool*/
{
  return (stack.push(50),pop(stack,logicalNot__$8(stack,equals__$38(stack,var_x,var_y))));
}

function assertEqual__$16(stack, var_left/*Float*/, var_right/*Float*/) /*Void*/
{
  if (notEquals__$39(stack,var_left,var_right))
  {
    (stack.push(51),pop(stack,error__$36(stack,add__$14(stack,add__$14(stack,add__$14(stack,"Expected ",repr__$40(stack,var_left))," == "),repr__$40(stack,var_right)))));
  }
}

// native function: malloc(Sample[Int])Sample[Int]
function malloc__$17(stack, var_null/*Sample[Int]*/) /*Sample[Int]*/
{
 return {aat:0};
}

function sum__$18(stack, var_x/*Int*/, var_args__0/*Int*/, var_args__1/*Int*/) /*Int*/
{
  return (stack.push(52),pop(stack,add__$11(stack,var_x,sum__$41(stack,var_args__0,var_args__1))));
}

function concatTypenames__$19(stack, var_null/*Int*/, var_null__0/*Float*/, var_null__1/*String*/) /*String*/
{
  return (stack.push(53),pop(stack,add__$14(stack,add__$14(stack,typestr__$42(stack,undefined),","),concatTypenames__$43(stack,undefined,undefined))));
}

function makeList__$20(stack, var_x/*Int*/, var_args__0/*Int*/, var_args__1/*Int*/, var_args__2/*Int*/) /*List[Int]*/
{
  return (stack.push(54),pop(stack,[var_x,var_args__0,var_args__1,var_args__2]));
}

function assertEqual__$21(stack, var_left/*List[Int]*/, var_right/*List[Int]*/) /*Void*/
{
  if (notEquals__$44(stack,var_left,var_right))
  {
    (stack.push(55),pop(stack,error__$36(stack,add__$14(stack,add__$14(stack,add__$14(stack,"Expected ",repr__$45(stack,var_left))," == "),repr__$45(stack,var_right)))));
  }
}

function tuple__$22(stack, var_x0/*Int*/, var_x1/*String*/) /*Tuple[Int,String]*/
{
  const var_t = malloc__$46(stack,undefined);
  (stack.push(56),pop(stack,var_t.aax0 = var_x0));
  (stack.push(57),pop(stack,var_t.aax1 = var_x1));
  return (stack.push(58),pop(stack,var_t));
}

function assertEqual__$23(stack, var_left/*Tuple[Int,String]*/, var_right/*Tuple[Int,String]*/) /*Void*/
{
  if (notEquals__$47(stack,var_left,var_right))
  {
    (stack.push(59),pop(stack,error__$36(stack,add__$14(stack,add__$14(stack,add__$14(stack,"Expected ",repr__$48(stack,var_left))," == "),repr__$48(stack,var_right)))));
  }
}

function equals__$24(stack, var_a/*Tuple[Int,String]*/, var_b/*Tuple[Int,String]*/) /*Bool*/
{
  return (stack.push(60),pop(stack,(equals__$9(stack,var_a.aax0,var_b.aax0)&&equals__$38(stack,var_a.aax1,var_b.aax1))));
}

function tuple__$25(stack, var_x0/*Float*/, var_x1/*Int*/, var_x2/*String*/) /*Tuple[Float,Int,String]*/
{
  const var_t = malloc__$49(stack,undefined);
  (stack.push(61),pop(stack,var_t.aax0 = var_x0));
  (stack.push(62),pop(stack,var_t.aax1 = var_x1));
  (stack.push(63),pop(stack,var_t.aax2 = var_x2));
  return (stack.push(64),pop(stack,var_t));
}

// native function: typestr(Tuple[Float,Int,String])String
function typestr__$26(stack, var_null/*Tuple[Float,Int,String]*/) /*String*/
{
  return 'Tuple[Float,Int,String]';
}

function str__$27(stack, var_x/*Int*/) /*String*/
{
  return (stack.push(65),pop(stack,repr__$13(stack,var_x)));
}

function repr__$28(stack, var_x/*Lambda[String,Int,Int]*/) /*String*/
{
  return (stack.push(66),pop(stack,add__$14(stack,add__$14(stack,"<",typestr__$50(stack,undefined))," instance>")));
}

// native function: call(Lambda[String,Int,Int],Int,Int)String
function call__$29(stack, var_f/*Lambda[String,Int,Int]*/, var_args__0/*Int*/, var_args__1/*Int*/) /*String*/
{
  return var_f(stack, var_args__0, var_args__1);
}

function makeLambda__$30(stack, var_null__0/*Int*/, var_null__1/*Float*/, var_null__2/*String*/) /*Lambda[Int,Int,Float,String]*/
{
  return (stack.push(67),pop(stack,((stack, var_args__0/*Int*/, var_args__1/*Float*/, var_args__2/*String*/) => 
  {
    return (stack.push(68),pop(stack,5));
  })));
}

function repr__$31(stack, var_x/*Lambda[Int,Int,Float,String]*/) /*String*/
{
  return (stack.push(69),pop(stack,add__$14(stack,add__$14(stack,"<",typestr__$51(stack,undefined))," instance>")));
}

// native function: call(Lambda[Int,Int,Float,String],Int,Float,String)Int
function call__$32(stack, var_f/*Lambda[Int,Int,Float,String]*/, var_args__0/*Int*/, var_args__1/*Float*/, var_args__2/*String*/) /*Int*/
{
  return var_f(stack, var_args__0, var_args__1, var_args__2);
}

const asyncFunction__$33 = asyncf(function* asyncFunction__$33(stack) /*Promise[Void]*/
{
  (stack.push(70),pop(stack,print__$34(stack,"I\'m at the beginning of asyncFunction")));
  (stack.push(71),pop(stack,(yield asyncSleep__$52(stack,10))));
  (stack.push(72),pop(stack,print__$34(stack,"I\'m at the end of asyncFunction (after await asyncSleep)")));
});

// native function: print(String)Void
function print__$34(stack, var_x/*String*/) /*Void*/
{
  console.log(var_x);

}

// native function: repr(String)String
function repr__$35(stack, var_x/*String*/) /*String*/
{
  // TODO
  return var_x;

}

// native function: error(String)Void
function error__$36(stack, var_x/*String*/) /*Void*/
{
  throw new Error(var_x);

}

// native function: isSameAs(Int,Int)Bool
function isSameAs__$37(stack, var_x/*Int*/, var_y/*Int*/) /*Bool*/
{
  return var_x === var_y;

}

function equals__$38(stack, var_x/*String*/, var_y/*String*/) /*Bool*/
{
  return (stack.push(73),pop(stack,isSameAs__$53(stack,var_x,var_y)));
}

function notEquals__$39(stack, var_x/*Float*/, var_y/*Float*/) /*Bool*/
{
  return (stack.push(74),pop(stack,logicalNot__$8(stack,equals__$54(stack,var_x,var_y))));
}

// native function: repr(Float)String
function repr__$40(stack, var_x/*Float*/) /*String*/
{
  return "" + var_x;

}

function sum__$41(stack, var_x/*Int*/, var_args__0/*Int*/) /*Int*/
{
  return (stack.push(75),pop(stack,add__$11(stack,var_x,sum__$55(stack,var_args__0))));
}

// native function: typestr(Int)String
function typestr__$42(stack, var_null/*Int*/) /*String*/
{
  return 'Int';
}

function concatTypenames__$43(stack, var_null/*Float*/, var_null__0/*String*/) /*String*/
{
  return (stack.push(76),pop(stack,add__$14(stack,add__$14(stack,typestr__$56(stack,undefined),","),concatTypenames__$57(stack,undefined))));
}

function notEquals__$44(stack, var_x/*List[Int]*/, var_y/*List[Int]*/) /*Bool*/
{
  return (stack.push(77),pop(stack,logicalNot__$8(stack,equals__$58(stack,var_x,var_y))));
}

function repr__$45(stack, var_xs/*List[Int]*/) /*String*/
{
  let var_str = "[";
  for (let var_i = 0;lessThan__$60(stack,var_i,len__$59(stack,var_xs));(var_i = add__$11(stack,var_i,1)))
  {
    if (greaterThan__$61(stack,var_i,0))
    {
      (stack.push(78),pop(stack,(var_str = add__$14(stack,var_str,", "))));
    }
    (stack.push(79),pop(stack,(var_str = add__$14(stack,var_str,repr__$13(stack,getItem__$62(stack,var_xs,var_i))))));
  }
  (stack.push(80),pop(stack,(var_str = add__$14(stack,var_str,"]"))));
  return (stack.push(81),pop(stack,var_str));
}

// native function: malloc(Tuple[Int,String])Tuple[Int,String]
function malloc__$46(stack, var_null/*Tuple[Int,String]*/) /*Tuple[Int,String]*/
{
 return {aax0:0,aax1:''};
}

function notEquals__$47(stack, var_x/*Tuple[Int,String]*/, var_y/*Tuple[Int,String]*/) /*Bool*/
{
  return (stack.push(82),pop(stack,logicalNot__$8(stack,equals__$24(stack,var_x,var_y))));
}

function repr__$48(stack, var_t/*Tuple[Int,String]*/) /*String*/
{
  return (stack.push(83),pop(stack,add__$14(stack,add__$14(stack,add__$14(stack,add__$14(stack,"tuple(",repr__$13(stack,var_t.aax0)),","),repr__$35(stack,var_t.aax1)),")")));
}

// native function: malloc(Tuple[Float,Int,String])Tuple[Float,Int,String]
function malloc__$49(stack, var_null/*Tuple[Float,Int,String]*/) /*Tuple[Float,Int,String]*/
{
 return {aax0:0.0,aax1:0,aax2:''};
}

// native function: typestr(Lambda[String,Int,Int])String
function typestr__$50(stack, var_null/*Lambda[String,Int,Int]*/) /*String*/
{
  return 'Lambda[String,Int,Int]';
}

// native function: typestr(Lambda[Int,Int,Float,String])String
function typestr__$51(stack, var_null/*Lambda[Int,Int,Float,String]*/) /*String*/
{
  return 'Lambda[Int,Int,Float,String]';
}

// native function: asyncSleep(Int)Promise[Void]
function asyncSleep__$52(stack, var_timeInMilliseconds/*Int*/) /*Promise[Void]*/
{
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      resolve();
    }, var_timeInMilliseconds);
  });

}

// native function: isSameAs(String,String)Bool
function isSameAs__$53(stack, var_x/*String*/, var_y/*String*/) /*Bool*/
{
  return var_x === var_y;

}

function equals__$54(stack, var_x/*Float*/, var_y/*Float*/) /*Bool*/
{
  return (stack.push(84),pop(stack,isSameAs__$63(stack,var_x,var_y)));
}

function sum__$55(stack, var_x/*Int*/) /*Int*/
{
  return (stack.push(85),pop(stack,var_x));
}

// native function: typestr(Float)String
function typestr__$56(stack, var_null/*Float*/) /*String*/
{
  return 'Float';
}

function concatTypenames__$57(stack, var_null/*String*/) /*String*/
{
  return (stack.push(86),pop(stack,typestr__$64(stack,undefined)));
}

function equals__$58(stack, var_xs/*List[Int]*/, var_ys/*List[Int]*/) /*Bool*/
{
  if (notEquals__$10(stack,len__$59(stack,var_xs),len__$59(stack,var_ys)))
  {
    return (stack.push(87),pop(stack,false));
  }
  let var_size = len__$59(stack,var_xs);
  for (let var_i = 0;lessThan__$60(stack,var_i,var_size);(var_i = add__$11(stack,var_i,1)))
  {
    if (notEquals__$10(stack,getItem__$62(stack,var_xs,var_i),getItem__$62(stack,var_ys,var_i)))
    {
      return (stack.push(88),pop(stack,false));
    }
  }
  return (stack.push(89),pop(stack,true));
}

// native function: len(List[Int])Int
function len__$59(stack, var_x/*List[Int]*/) /*Int*/
{
  return var_x.length;

}

// native function: lessThan(Int,Int)Bool
function lessThan__$60(stack, var_x/*Int*/, var_y/*Int*/) /*Bool*/
{
  return var_x < var_y;

}

function greaterThan__$61(stack, var_x/*Int*/, var_y/*Int*/) /*Bool*/
{
  return (stack.push(90),pop(stack,lessThan__$60(stack,var_y,var_x)));
}

// native function: getItem(List[Int],Int)Int
function getItem__$62(stack, var_xs/*List[Int]*/, var_i/*Int*/) /*Int*/
{
  if (var_i < 0 || var_i >= var_xs.length) {
    throw new Error("getItem List out of bounds: i = " + var_i +
                    " xs.length = " + var_xs.length);
  }
  return var_xs[var_i];

}

// native function: isSameAs(Float,Float)Bool
function isSameAs__$63(stack, var_x/*Float*/, var_y/*Float*/) /*Bool*/
{
  return var_x === var_y;

}

// native function: typestr(String)String
function typestr__$64(stack, var_null/*String*/) /*String*/
{
  return 'String';
}
// --- tag list, for generating helpful stack traces ---
const tagList = ["staticBlock__0()@test.tt@136","staticBlock__0()@test.tt@137","main()@test.tt@5","main()@test.tt@6","main()@test.tt@7","main()@test.tt@9","main()@test.tt@10","main()@test.tt@11","main()@test.tt@12","main()@test.tt@14","main()@test.tt@15","main()@test.tt@16","main()@test.tt@18","main()@test.tt@23","main()@test.tt@26","main()@test.tt@27","main()@test.tt@28","main()@test.tt@34","main()@test.tt@37","main()@test.tt@39","main()@test.tt@40","main()@test.tt@46","main()@test.tt@47","main()@test.tt@48","main()@test.tt@53","main()@test.tt@54","main()@test.tt@55","main()@test.tt@60","main()@test.tt@61","main()@test.tt@68","main()@test.tt@69","main()@test.tt@72","main()@test.tt@74","main()@test.tt@75","main()@test.tt@76","main()@test.tt@78","main()@test.tt@79","main()@test.tt@85","main()@test.tt@87","main()@test.tt@88","main()@test.tt@91","main()@test.tt@92","main()@test.tt@97","main()@test.tt@100","assertEqual(String,String)@C:\\Users\\math4\\Documents\\GitHub\\tt\\src\\lib\\assert.tt@20","assert(Bool)@C:\\Users\\math4\\Documents\\GitHub\\tt\\src\\lib\\assert.tt@4","assertFalse(Bool)@C:\\Users\\math4\\Documents\\GitHub\\tt\\src\\lib\\assert.tt@9","equals(Int,Int)@C:\\Users\\math4\\Documents\\GitHub\\tt\\src\\lib\\prelude.tt@13","notEquals(Int,Int)@C:\\Users\\math4\\Documents\\GitHub\\tt\\src\\lib\\prelude.tt@17","assertEqual(Int,Int)@C:\\Users\\math4\\Documents\\GitHub\\tt\\src\\lib\\assert.tt@20","notEquals(String,String)@C:\\Users\\math4\\Documents\\GitHub\\tt\\src\\lib\\prelude.tt@17","assertEqual(Float,Float)@C:\\Users\\math4\\Documents\\GitHub\\tt\\src\\lib\\assert.tt@20","sum(Int,Int,Int)@test.tt@123","concatTypenames(Int,Float,String)@test.tt@115","makeList(Int,Int,Int,Int)@test.tt@127","assertEqual(List[Int],List[Int])@C:\\Users\\math4\\Documents\\GitHub\\tt\\src\\lib\\assert.tt@20","tuple(Int,String)@C:\\Users\\math4\\Documents\\GitHub\\tt\\src\\lib\\tuple.tt@133","tuple(Int,String)@C:\\Users\\math4\\Documents\\GitHub\\tt\\src\\lib\\tuple.tt@134","tuple(Int,String)@C:\\Users\\math4\\Documents\\GitHub\\tt\\src\\lib\\tuple.tt@135","assertEqual(Tuple[Int,String],Tuple[Int,String])@C:\\Users\\math4\\Documents\\GitHub\\tt\\src\\lib\\assert.tt@20","equals(Tuple[Int,String],Tuple[Int,String])@C:\\Users\\math4\\Documents\\GitHub\\tt\\src\\lib\\tuple.tt@161","tuple(Float,Int,String)@C:\\Users\\math4\\Documents\\GitHub\\tt\\src\\lib\\tuple.tt@139","tuple(Float,Int,String)@C:\\Users\\math4\\Documents\\GitHub\\tt\\src\\lib\\tuple.tt@140","tuple(Float,Int,String)@C:\\Users\\math4\\Documents\\GitHub\\tt\\src\\lib\\tuple.tt@141","tuple(Float,Int,String)@C:\\Users\\math4\\Documents\\GitHub\\tt\\src\\lib\\tuple.tt@142","str(Int)@C:\\Users\\math4\\Documents\\GitHub\\tt\\src\\lib\\prelude.tt@35","repr(Lambda[String,Int,Int])@C:\\Users\\math4\\Documents\\GitHub\\tt\\src\\lib\\prelude.tt@31","makeLambda(Int,Float,String)@test.tt@150","makeLambda(Int,Float,String)@test.tt@151","repr(Lambda[Int,Int,Float,String])@C:\\Users\\math4\\Documents\\GitHub\\tt\\src\\lib\\prelude.tt@31","asyncFunction()@test.tt@156","asyncFunction()@test.tt@157","asyncFunction()@test.tt@158","equals(String,String)@C:\\Users\\math4\\Documents\\GitHub\\tt\\src\\lib\\prelude.tt@13","notEquals(Float,Float)@C:\\Users\\math4\\Documents\\GitHub\\tt\\src\\lib\\prelude.tt@17","sum(Int,Int)@test.tt@123","concatTypenames(Float,String)@test.tt@115","notEquals(List[Int],List[Int])@C:\\Users\\math4\\Documents\\GitHub\\tt\\src\\lib\\prelude.tt@17","repr(List[Int])@C:\\Users\\math4\\Documents\\GitHub\\tt\\src\\lib\\list.tt@38","repr(List[Int])@C:\\Users\\math4\\Documents\\GitHub\\tt\\src\\lib\\list.tt@40","repr(List[Int])@C:\\Users\\math4\\Documents\\GitHub\\tt\\src\\lib\\list.tt@42","repr(List[Int])@C:\\Users\\math4\\Documents\\GitHub\\tt\\src\\lib\\list.tt@43","notEquals(Tuple[Int,String],Tuple[Int,String])@C:\\Users\\math4\\Documents\\GitHub\\tt\\src\\lib\\prelude.tt@17","repr(Tuple[Int,String])@C:\\Users\\math4\\Documents\\GitHub\\tt\\src\\lib\\tuple.tt@207","equals(Float,Float)@C:\\Users\\math4\\Documents\\GitHub\\tt\\src\\lib\\prelude.tt@13","sum(Int)@test.tt@119","concatTypenames(String)@test.tt@111","equals(List[Int],List[Int])@C:\\Users\\math4\\Documents\\GitHub\\tt\\src\\lib\\list.tt@48","equals(List[Int],List[Int])@C:\\Users\\math4\\Documents\\GitHub\\tt\\src\\lib\\list.tt@53","equals(List[Int],List[Int])@C:\\Users\\math4\\Documents\\GitHub\\tt\\src\\lib\\list.tt@56","greaterThan(Int,Int)@C:\\Users\\math4\\Documents\\GitHub\\tt\\src\\lib\\prelude.tt@24"];
tryAndCatch(stack => {
// --- call all the static stuff ---
staticBlock__0__$1(stack);
staticBlock__1__$2(stack);
staticBlock__2__$3(stack);
// --- finally call main ---
main__$4(stack);
});
})();
tt programming language
=======================

## Install instructions

You need node.js installed, and 'node' must be in your path.

For Windows, OS X or linux, add src/bin to PATH.

You can then run tests by running

    ttjs src/test.tt | node

or on any environment with 'node' on it, you can run

    node src/ttjs.js src/test.tt | node

## Design principles

There are three design principles, in order of importance:

  1. Safe
     Even if you are super tired on a Friday night and you can't
     think straight because your head is throbbing, you should still be
     able to make modifications with minimal chance of introducing a new bug.

     This is accomplished with good stack traces, good error messages,
     and throwing an error at the earliest sign that something is wrong.
     (More like Python, less like C++ (no stack traces by default) or
     JavaScript (ignores))

     There is no null in the language. If you need an absence of value,
     you can use the "Maybe[$T]" type.
     If you want an absence of Int, you can use "nothing(Int)".
     If you want Maybe[Int] with value 5, you can us "just(5)".

     All variables must be initialized when declared.
     This might seem restrictive if you haven't coded in a language that
     forces you to do this, but it really isn't.

     Everything is statically typed, and there is no type casting.
     Convert the value instead of trying to cast it.

     Async/await has good stack traces when you error inside them.

     If you use Javascript async/await hacks with generators, you
     lose basically all stack trace information before the async function
     call, because generators don't keep stack trace information.

     In TT, you get all stack traces all the way to the top even with
     multiple async/await calls in the middle.

     Oh also, if you create a Promise and don't await on it within the
     current async frame, you will get an exception. So no more
     exceptions inside Promises that get silently ignored.

  2. Fun
     Coding in TT should be fun.

     Async/await vs just Promises
     Async/await is waaay more fun.

     Varags. Runtime varargs are dangerous, breaking principle (1).
     So Varargs in TT are compile time constructs. The generated
     JavaScript functions all have a fixed number of expected arguments.

  3. Fast
     The output JavaScript is always monomorphic, which should help with
     optimizations for modern javascript engines.

     Some features like 'auto' variables (requires generating a try/finally
     block), causes V8 to deoptimize. But it doesn't cost anything if
     you don't use them.

     I'm still working on the output JavaScript to include closure compiler
     type annotations, but once that's done you'll be able to run it
     through closure compiler with ADVANCED options with everything turned
     on.


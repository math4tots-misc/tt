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
  1. Even if you are super tired on a Friday night and you can't
     think straight because your head is throbbing, you should still be
     able to make modifications with minimal chance of introducing a new bug.
  2. It's ok to pay with performance if it improves debugging
    Examples:
    * Explicit stack traces with line numbers
    * async/await should have complete stack traces
      The performance cost here is copying the full stack trace
      when calling an async function
  3. (From Python) In the face of ambiguity, refuse the temptation to guess.
    Examples:
    * (From Python) A bug in the user's code should not be allowed to lead to
       undefined behavior; a core dump is never the user's fault.
  4. (From Python) Errors should never pass silently.
    Examples:
    * If 'await' or 'runAsync' is never called on a Promise, it will
      throw an error when the enclosing async stack frame group exits.
    * NO null.
      If you really need an absence of value, a "Maybe" type is available.
  5. (From Python) Readability counts.

2. Fun
  1. It's ok to pay with performance if it adds fun
    Examples:
    * Garbage collection. There might be better ways to handle this,
      but I couldn't really think of one (maybe Rust's way? but that seems
      hard to do, to incorporate life-times into the type system).
      Raw manual memory management can get super painful, and flies in
      the face of safe/debuggable.
      Reference counting or even just letting memory leak in the very
      worst case might still be better.

  2. Don't fight the underlying semantics
     Swift for instance makes working with JSON really tedious by trying
     to be "type-safe".
     It's ok to have areas that are less "safe" in some ways, if the
     underlying semantics are "unsafe" like with JSON.
     Just make sure that the boundaries of what is "safe" and what isn't
     is clear.
     In tt, the interactions are completely strongly statically typed,
     but Json itself is just treated as one blob type, and will throw
     a runtime exception if you try to use it in the wrong way.

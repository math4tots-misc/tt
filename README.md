tt programming language
=======================

There's a lot of metaprogramming here.

Method dispatch is done statically by pattern matching types.

As such, there are no methods and no inheritance.

"Inheritance" and code reuse is done using
pattern matching.

This is a transpiler that converts tt programs to javascript.

You can test it using node:

  node ttjs.js prelude.tt sample.tt | node

on a Windows, OSX or linux command line.

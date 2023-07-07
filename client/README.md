All of the code for the client application that runs on laptops distributed to participants is in this directory.

Testing on an arm64 (M1) mac: Because the better-sqlite3 module is native code, it will need to be built for the arm64 architecture. You can do this with `yarn build:mac:arm64`. This will end in an error; ignore it. (The error relates to building the entire application, which we don't need to do with this script.) Once you've done that you should be able to run `yarn test` and not get errors about the architecture better-sqlite3 is built for.
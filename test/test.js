//var transfo = require("../index.js")
//transfo(require("fs").readFileSync("./test.jsxz"),
//{parserOptions: {tabWidth: 2,sourceFileName: "source.js",sourceMapName: "map.json"}}
//,function(err,res,files){
//  console.log("error:")
//  console.log(err)
//  console.log("deps:")
//  console.log(files)
//  console.log("code:")
//  console.log(res.code)
//  console.log("result:")
//  console.log(res)
//})

var plugins
if(process.argv[2] == "jsx"){
  plugins = [[require("../index.js").default,{templatesDir: "."}],"transform-react-jsx"]
}else{
  plugins = [[require("../index.js").default,{templatesDir: "."}]]
}
var transformFile = require('babel-core').transformFile

transformFile("test.jsxz",{
  plugins: plugins
  //plugins: [[require("../index.js").default,{templatesDir: "toto"}],"transform-react-jsx"]
  //plugins: [[require("../index.js").default,{templatesDir: "toto"}]]
}, function(err, result) {
  if(err){
    console.log(err)
  }else{
    console.log(result.code)
  }
})
//transformFile("test_final.jsx",{
//  presets: ["react"]
//}, function(err, result) {
//  if(err){
//    console.log(err)
//  }else{
//    console.log(result.code)
//  }
//})

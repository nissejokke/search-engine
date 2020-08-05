// declaring module will allow typescript to import the module
declare module 'xml-stream' {
  // typing module default export as `any` will allow you to access its members without compiler warning
  let XmlStream: any;
  export default XmlStream;
}

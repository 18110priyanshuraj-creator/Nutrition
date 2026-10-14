import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypeScript from "eslint-config-next/typescript";
const config = [...nextVitals, ...nextTypeScript, { ignores: [".next/**", ".next-agent-check/**", "node_modules/**", "data/**", "coverage/**"] }];
export default config;
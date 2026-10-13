import {afterEach,describe,expect,it} from "vitest";
import {securityConfigurationError} from "../src/lib/auth";

const original={appPassword:process.env.APP_PASSWORD,sessionSecret:process.env.SESSION_SECRET};

afterEach(()=>{
 if(original.appPassword===undefined)delete process.env.APP_PASSWORD;
 else process.env.APP_PASSWORD=original.appPassword;
 if(original.sessionSecret===undefined)delete process.env.SESSION_SECRET;
 else process.env.SESSION_SECRET=original.sessionSecret;
});

describe("security configuration",()=>{
 it("rejects the documented example app password",()=>{
  process.env.APP_PASSWORD="replace-with-a-long-unique-password-at-least-12-characters";
  process.env.SESSION_SECRET="a-valid-test-session-secret-that-is-long-enough";
  expect(securityConfigurationError()).toContain("APP_PASSWORD");
 });

 it("rejects the documented example session secret",()=>{
  process.env.APP_PASSWORD="a-valid-test-password";
  process.env.SESSION_SECRET="replace-with-a-random-secret-at-least-32-characters";
  expect(securityConfigurationError()).toContain("SESSION_SECRET");
 });

 it("accepts configured values meeting the minimum lengths",()=>{
  process.env.APP_PASSWORD="a-valid-test-password";
  process.env.SESSION_SECRET="a-valid-test-session-secret-that-is-long-enough";
  expect(securityConfigurationError()).toBeNull();
 });
});

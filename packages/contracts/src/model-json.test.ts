import { describe, expect, it } from "vitest";
import { z } from "zod";
import { parseModelJson } from "./model-json";

const Schema = z.object({ text: z.string(), n: z.number() });

describe("parseModelJson", () => {
  it("parses a clean JSON object and validates it against the schema", () => {
    expect(parseModelJson('{"text":"hi","n":1}', Schema)).toEqual({ text: "hi", n: 1 });
  });

  it("parses JSON wrapped in a ```json fenced code block", () => {
    const raw = '```json\n{"text":"hi","n":1}\n```';
    expect(parseModelJson(raw, Schema)).toEqual({ text: "hi", n: 1 });
  });

  it("parses JSON wrapped in a bare ``` fenced code block", () => {
    const raw = '```\n{"text":"hi","n":1}\n```';
    expect(parseModelJson(raw, Schema)).toEqual({ text: "hi", n: 1 });
  });

  it("parses a JSON object surrounded by prose", () => {
    const raw = 'Sure! Here is the result:\n{"text":"hi","n":1}\nHope that helps.';
    expect(parseModelJson(raw, Schema)).toEqual({ text: "hi", n: 1 });
  });

  it("throws a clear error when the text contains no JSON object", () => {
    expect(() => parseModelJson("I cannot help with that.", Schema)).toThrow(/valid JSON/i);
  });

  it("still enforces the schema (valid JSON that does not match is rejected)", () => {
    expect(() => parseModelJson('{"text":"hi"}', Schema)).toThrow();
  });
});

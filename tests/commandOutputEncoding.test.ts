import assert from "node:assert/strict";
import test from "node:test";

import {
  createCommandOutputStreamDecoder,
  decodeCommandOutputBuffer
} from "../src/main/commandRunner.js";

test("command output decoder falls back to GB18030 for Chinese Windows tool output", () => {
  const output = Buffer.from([
    0x5b, 0x45, 0x52, 0x52, 0x4f, 0x52, 0x5d, 0x20, 0x45, 0x3a, 0x5c, 0x43, 0x6f,
    0x64, 0x65, 0x48, 0x6f, 0x6d, 0x65, 0x5c, 0xd2, 0xd1, 0xcd, 0xea, 0xb3, 0xc9,
    0xb5, 0xc4, 0xcf, 0xee, 0xc4, 0xbf
  ]);

  assert.equal(decodeCommandOutputBuffer(output), "[ERROR] E:\\CodeHome\\已完成的项目");
});

test("command output decoder keeps valid UTF-8 output unchanged", () => {
  const output = Buffer.from("测试 UTF-8 output", "utf8");

  assert.equal(decodeCommandOutputBuffer(output), "测试 UTF-8 output");
});

test("command output decoder detects GB18030 bytes that are also valid UTF-8", () => {
  const output = Buffer.from([0xc3, 0xa9, 0xcc, 0xa8]);

  assert.equal(decodeCommandOutputBuffer(output), "茅台");
});

test("command output decoder keeps a literal UTF-8 replacement character", () => {
  const output = Buffer.from("Forge � output", "utf8");

  assert.equal(decodeCommandOutputBuffer(output), "Forge � output");
});

test("stream command output decoder keeps split UTF-8 characters intact", () => {
  const decoder = createCommandOutputStreamDecoder();
  const output = Buffer.from("路径测试", "utf8");
  const decoded = [
    decoder.decode(output.subarray(0, 1)),
    decoder.decode(output.subarray(1, 4)),
    decoder.decode(output.subarray(4)),
    decoder.flush()
  ].join("");

  assert.equal(decoded, "路径测试");
});

test("stream command output decoder keeps split GB18030 characters intact", () => {
  const decoder = createCommandOutputStreamDecoder();
  const output = Buffer.from([0xd2, 0xd1, 0xcd, 0xea, 0xb3, 0xc9]);
  const decoded = [
    decoder.decode(output.subarray(0, 1)),
    decoder.decode(output.subarray(1, 3)),
    decoder.decode(output.subarray(3)),
    decoder.flush()
  ].join("");

  assert.equal(decoded, "已完成");
});

test("stream command output decoder waits before locking ambiguous GB18030 bytes", () => {
  const decoder = createCommandOutputStreamDecoder();
  const decoded = [
    decoder.decode(Buffer.from([0xc3, 0xa9])),
    decoder.decode(Buffer.from([0xcc, 0xa8])),
    decoder.flush()
  ].join("");

  assert.equal(decoded, "茅台");
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { checkResolved, checkTarget, isDeniedAddress } from "../../src/egress/ip-policy.ts";

test("denies private, loopback, link-local, metadata and special ranges", () => {
  for (const a of [
    "10.0.0.5", "127.0.0.1", "127.255.255.254", "169.254.169.254", "172.16.0.1", "172.31.255.255", "192.168.1.1",
    "100.64.0.1", "0.0.0.0", "224.0.0.1", "255.255.255.255", "198.18.0.1",
    "::1", "::", "fe80::1", "fc00::1", "fd12:3456::1", "ff02::1",
    "::ffff:127.0.0.1", "::ffff:10.0.0.5", "::ffff:7f00:1", "::ffff:a9fe:a9fe", "64:ff9b::a9fe:a9fe", "[::1]", "fe80::1%eth0",
  ]) assert.equal(isDeniedAddress(a), true, a);
});

test("allows ordinary public addresses", () => {
  for (const a of ["140.82.112.3", "1.1.1.1", "8.8.8.8", "2606:4700:4700::1111", "2a00:1450:4001::200e"]) assert.equal(isDeniedAddress(a), false, a);
});

test("refuses strings that are not addresses", () => {
  assert.equal(isDeniedAddress("github.com"), true);
  assert.equal(isDeniedAddress(""), true);
});

test("checkTarget: exact allowlist, 443 only, no IP literals", () => {
  const allowed = new Set(["github.com", "zed.dev"]);
  assert.equal(checkTarget("github.com", 443, allowed), null);
  assert.equal(checkTarget("GitHub.com.", 443, allowed), null);
  assert.equal(checkTarget("api.github.com", 443, allowed), "host_not_allowed");
  assert.equal(checkTarget("github.com.evil.example", 443, allowed), "host_not_allowed");
  assert.equal(checkTarget("github.com", 80, allowed), "bad_port");
  assert.equal(checkTarget("github.com", 8443, allowed), "bad_port");
  assert.equal(checkTarget("10.0.0.5", 443, allowed), "private_range");
  assert.equal(checkTarget("169.254.169.254", 80, allowed), "private_range");
  assert.equal(checkTarget("[::1]", 443, allowed), "private_range");
  assert.equal(checkTarget("1.1.1.1", 443, allowed), "ip_literal");
});

test("checkResolved: any private answer denies the whole name (DNS rebinding)", () => {
  assert.equal(checkResolved(["140.82.112.3"]), null);
  assert.equal(checkResolved(["140.82.112.3", "127.0.0.1"]), "private_range");
  assert.equal(checkResolved(["::ffff:169.254.169.254"]), "private_range");
  assert.equal(checkResolved([]), "dns_failed");
});

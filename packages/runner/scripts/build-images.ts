/**
 * Builds the two runner images from pinned base digests and prints the
 * resulting image IDs (the browser image ID is what /healthz reports).
 *   npm run images -w @wallio/runner
 */
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

const pkg = resolve(import.meta.dirname, "..");
const bin = process.env.DOCKER_BIN || "docker";
const images = [
  { tag: process.env.RUNNER_BROWSER_IMAGE || "wallio-browser:0.1.0", file: "image/Dockerfile.browser" },
  { tag: process.env.RUNNER_EGRESS_IMAGE || "wallio-egress:0.1.0", file: "image/Dockerfile.egress" },
];
for (const { tag, file } of images) {
  console.log(`building ${tag}`);
  execFileSync(bin, ["build", "--pull=false", "-f", file, "-t", tag, "."], { cwd: pkg, stdio: "inherit" });
  const id = execFileSync(bin, ["image", "inspect", "--format", "{{.Id}}", tag]).toString().trim();
  console.log(`${tag} → ${id}`);
}

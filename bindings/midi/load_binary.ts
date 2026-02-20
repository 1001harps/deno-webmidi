const REPO = "1001harps/deno-webmidi";
const VERSION = "0.1.0";

const PLATFORM_MAP: Record<string, string> = {
  "aarch64-darwin": "libmidi-aarch64-apple-darwin.dylib",
  "x86_64-linux": "libmidi-x86_64-unknown-linux-gnu.so",
};

export async function loadBinary(): Promise<string> {
  const override = Deno.env.get("MIDI_BINARY_PATH");
  if (override) return override;

  const key = `${Deno.build.arch}-${Deno.build.os}`;
  const filename = PLATFORM_MAP[key];
  if (!filename) throw new Error(`Unsupported platform: ${key}`);

  const cacheDir = `${Deno.env.get("HOME")}/.cache/deno-webmidi/${VERSION}`;
  const cachedPath = `${cacheDir}/${filename}`;

  try {
    await Deno.stat(cachedPath);
    return cachedPath;
  } catch {
    // not cached — download
  }

  const url = `https://github.com/${REPO}/releases/download/v${VERSION}/${filename}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to download binary: ${res.status} ${url}`);

  await Deno.mkdir(cacheDir, { recursive: true });
  await Deno.writeFile(cachedPath, new Uint8Array(await res.arrayBuffer()));
  await Deno.chmod(cachedPath, 0o755);
  return cachedPath;
}

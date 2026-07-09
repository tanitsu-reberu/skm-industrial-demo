import path from "node:path";

export const AGREEMENTS_DIR = "Договоренности";

export function agreementsOutputPaths(filename) {
  const root = process.cwd();
  const home = process.env.USERPROFILE ?? "";

  return [
    path.join(root, AGREEMENTS_DIR, filename),
    path.join(root, "presentations", filename),
    path.join(home, "Downloads", filename),
  ];
}
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import path from "path";
import mongoose from "mongoose";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envPath = path.resolve(__dirname, "../.env");

console.log(`Loading environment from ${envPath}`);
dotenv.config({ path: envPath });

const { connectDatabase } = await import("../src/db.js");
const { isMemoryStoreEnabled } = await import("../src/memory-store.js");
const { Circular } = await import("../src/models.js");
const CircularModel = mongoose.model("Circular");

const WOMEN_CELL_IDS = ["cell-women", "cell-womens-study"];
const TEST_REGEX = /(?:test|demo|sample|dummy|placeholder)/i;

async function main() {
  await connectDatabase();

  if (isMemoryStoreEnabled()) {
    console.error(
      "Memory fallback is enabled or MongoDB is unavailable. This cleanup script requires a real MongoDB connection.",
    );
    process.exit(1);
  }

  const deleteFilter = {
    $or: [
      { cellId: { $nin: WOMEN_CELL_IDS } },
      { title: TEST_REGEX },
      { description: TEST_REGEX },
    ],
  };

  const totalToDelete = await Circular.countDocuments(deleteFilter);
  const womenTotal = await Circular.countDocuments({ cellId: { $in: WOMEN_CELL_IDS } });
  const womenTestTotal = await Circular.countDocuments({
    cellId: { $in: WOMEN_CELL_IDS },
    $or: [{ title: TEST_REGEX }, { description: TEST_REGEX }],
  });

  console.log("Circular cleanup preview:");
  console.log(`  Total circulars that will be removed: ${totalToDelete}`);
  console.log(`  Women cell circulars preserved: ${womenTotal}`);
  console.log(`  Women cell circulars matching test keywords: ${womenTestTotal}`);
  console.log("");
  console.log("Delete criteria:");
  console.log("  - Any circular not in Women Cell or Women's Study Cell");
  console.log("  - Any circular with title or description containing test/demo/sample/dummy/placeholder");
  console.log("");

  if (!process.argv.includes("--yes")) {
    console.log("This is a destructive action. Re-run with --yes to perform deletion.");
    process.exit(0);
  }

  const result = await CircularModel.deleteMany(deleteFilter);
  console.log(`Deleted ${result.deletedCount} circular(s).`);
}

main().catch((error) => {
  console.error("Cleanup failed:", error);
  process.exit(1);
});

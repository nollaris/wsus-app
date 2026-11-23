import { NextResponse } from "next/server";
import AdmZip from "adm-zip";
import {
  importCsvBuffer,
  type ImportFileResult,
  type ImportMode,
} from "@/lib/csv-importer";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const rawMode = formData.get("mode");
    const mode: ImportMode = rawMode === "append" ? "append" : "replace";
    const files = formData
      .getAll("files")
      .filter((item): item is File => item instanceof File);

    if (files.length === 0) {
      return NextResponse.json(
        { error: "Please upload at least one .csv or .zip file." },
        { status: 400 }
      );
    }

    const csvEntries: { name: string; buffer: Buffer }[] = [];
    const results: ImportFileResult[] = [];

    for (const file of files) {
      const lower = file.name.toLowerCase();
      const buffer = Buffer.from(await file.arrayBuffer());

      if (lower.endsWith(".zip")) {
        try {
          const zip = new AdmZip(buffer);
          const entries = zip.getEntries();
          let foundCsv = false;
          for (const entry of entries) {
            if (
              !entry.isDirectory &&
              entry.entryName.toLowerCase().endsWith(".csv") &&
              !entry.entryName.startsWith("__MACOSX")
            ) {
              foundCsv = true;
              csvEntries.push({
                name: entry.entryName,
                buffer: entry.getData(),
              });
            }
          }
          if (!foundCsv) {
            results.push({
              fileName: file.name,
              table: "Archive",
              rowsParsed: 0,
              rowsImported: 0,
              status: "skipped",
              message: "No .csv files found inside ZIP archive.",
            });
          }
        } catch (err) {
          results.push({
            fileName: file.name,
            table: "Archive",
            rowsParsed: 0,
            rowsImported: 0,
            status: "error",
            message:
              err instanceof Error ? err.message : "Invalid ZIP archive.",
          });
        }
      } else if (lower.endsWith(".csv")) {
        csvEntries.push({ name: file.name, buffer });
      } else {
        results.push({
          fileName: file.name,
          table: "Unsupported",
          rowsParsed: 0,
          rowsImported: 0,
          status: "skipped",
          message: "Only .csv and .zip files are supported.",
        });
      }
    }

    for (const entry of csvEntries) {
      const res = await importCsvBuffer(entry.name, entry.buffer, mode);
      results.push(res);
    }

    const totalImported = results.reduce((sum, r) => sum + r.rowsImported, 0);
    return NextResponse.json({ results, totalImported, mode });
  } catch (error) {
    console.error("Import API error:", error);
    return NextResponse.json(
      { error: "Failed to process import request." },
      { status: 500 }
    );
  }
}

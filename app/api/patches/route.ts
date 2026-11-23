import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const tab = searchParams.get("tab") === "status" ? "status" : "inventory";
  const search = (searchParams.get("search") ?? "").trim();
  const classification = searchParams.get("classification") ?? "all";
  const serverName = searchParams.get("serverName") ?? "all";
  const severity = searchParams.get("severity") ?? "all";
  const approved = searchParams.get("approved") ?? "all";
  const state = searchParams.get("state") ?? "all";
  const sortBy = searchParams.get("sortBy") ?? "";
  const sortDir: Prisma.SortOrder =
    searchParams.get("sortDir") === "asc" ? "asc" : "desc";
  const page = Math.max(1, Number.parseInt(searchParams.get("page") ?? "1", 10) || 1);
  const pageSize = Math.min(
    100,
    Math.max(10, Number.parseInt(searchParams.get("pageSize") ?? "25", 10) || 25)
  );
  const skip = (page - 1) * pageSize;

  if (tab === "inventory") {
    const conditions: Prisma.Sql[] = [];
    if (search) {
      const pattern = `%${search}%`;
      conditions.push(
        Prisma.sql`("title" ILIKE ${pattern} OR "kbArticle" ILIKE ${pattern} OR "products" ILIKE ${pattern} OR "serverName" ILIKE ${pattern})`
      );
    }
    if (serverName !== "all") {
      conditions.push(Prisma.sql`"serverName" = ${serverName}`);
    }
    if (classification !== "all") {
      conditions.push(Prisma.sql`"classification" = ${classification}`);
    }
    if (severity !== "all") {
      conditions.push(Prisma.sql`"msrcSeverity" = ${severity}`);
    }
    if (approved === "approved") {
      conditions.push(Prisma.sql`"isApproved" = true`);
    } else if (approved === "declined") {
      conditions.push(Prisma.sql`"isDeclined" = true`);
    }

    const whereClause =
      conditions.length > 0
        ? Prisma.sql`WHERE ${Prisma.join(conditions, " AND ")}`
        : Prisma.empty;

    const INVENTORY_SORT_COLUMNS: Record<string, string> = {
      title: '"title"',
      kbArticle: '"kbArticle"',
      classification: '"classification"',
      msrcSeverity: '"msrcSeverity"',
      isApproved: '"isApproved"',
      isSuperseded: '"isSuperseded"',
      arrivalDate: '"arrivalDate"',
    };
    const sortColumn = INVENTORY_SORT_COLUMNS[sortBy] ?? '"arrivalDate"';
    const sortDirection = sortDir === "asc" ? "ASC" : "DESC";
    const nullsOrder =
      sortColumn === '"arrivalDate"'
        ? sortDirection === "DESC"
          ? " NULLS LAST"
          : " NULLS FIRST"
        : "";
    const outerOrderBy = Prisma.raw(
      `ORDER BY ${sortColumn} ${sortDirection}${nullsOrder}, "title" ASC`
    );

    const [items, countRows] = await Promise.all([
      prisma.$queryRaw<
        Array<{
          serverName: string;
          updateId: string;
          revisionNumber: number;
          title: string;
          kbArticle: string | null;
          products: string | null;
          classification: string;
          arrivalDate: Date | null;
          msrcSeverity: string;
          isApproved: boolean;
          isDeclined: boolean;
          isSuperseded: boolean;
          updateType: string;
          description: string;
        }>
      >(Prisma.sql`
        WITH deduped AS (
          SELECT DISTINCT ON ("updateId")
            "serverName",
            "updateId",
            "revisionNumber",
            "title",
            "kbArticle",
            "products",
            "classification",
            "arrivalDate",
            "msrcSeverity",
            "isApproved",
            "isDeclined",
            "isSuperseded",
            "updateType",
            "description"
          FROM "PatchInventory"
          ${whereClause}
          ORDER BY "updateId", "isLatestRevision" DESC, "revisionNumber" DESC, "isApproved" DESC, "arrivalDate" DESC NULLS LAST
        )
        SELECT *
        FROM deduped
        ${outerOrderBy}
        LIMIT ${pageSize} OFFSET ${skip}
      `),
      prisma.$queryRaw<Array<{ count: number }>>(Prisma.sql`
        SELECT COUNT(DISTINCT "updateId")::int AS count
        FROM "PatchInventory"
        ${whereClause}
      `),
    ]);

    const total = countRows[0]?.count ?? 0;

    return NextResponse.json({
      items,
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    });
  }

  const where: Prisma.ClientPatchStatusWhereInput = {};
  if (search) {
    where.OR = [
      { computerName: { contains: search, mode: "insensitive" } },
      { updateTitle: { contains: search, mode: "insensitive" } },
      { kbArticle: { contains: search, mode: "insensitive" } },
      { serverName: { contains: search, mode: "insensitive" } },
    ];
  }
  if (serverName !== "all") where.serverName = serverName;
  if (classification !== "all") where.classification = classification;
  if (state !== "all") where.installationState = state;

  const STATUS_SORT_FIELDS = new Set([
    "computerName",
    "serverName",
    "updateTitle",
    "kbArticle",
    "classification",
    "installationState",
  ]);
  const statusOrderBy: Prisma.ClientPatchStatusOrderByWithRelationInput[] =
    STATUS_SORT_FIELDS.has(sortBy)
      ? [{ [sortBy]: sortDir }, { updateTitle: "asc" }]
      : [{ computerName: "asc" }, { updateTitle: "asc" }];

  const [items, total] = await Promise.all([
    prisma.clientPatchStatus.findMany({
      where,
      orderBy: statusOrderBy,
      skip,
      take: pageSize,
    }),
    prisma.clientPatchStatus.count({ where }),
  ]);

  return NextResponse.json({
    items,
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  });
}

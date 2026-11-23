import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";

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
    const where: Prisma.PatchInventoryWhereInput = {};
    if (search) {
      where.OR = [
        { title: { contains: search, mode: "insensitive" } },
        { kbArticle: { contains: search, mode: "insensitive" } },
        { products: { contains: search, mode: "insensitive" } },
        { serverName: { contains: search, mode: "insensitive" } },
      ];
    }
    if (serverName !== "all") where.serverName = serverName;
    if (classification !== "all") where.classification = classification;
    if (severity !== "all") where.msrcSeverity = severity;
    if (approved === "approved") where.isApproved = true;
    else if (approved === "declined") where.isDeclined = true;

    const INVENTORY_SORT_FIELDS = new Set([
      "title",
      "serverName",
      "kbArticle",
      "classification",
      "msrcSeverity",
      "isApproved",
      "arrivalDate",
    ]);
    const invOrderBy: Prisma.PatchInventoryOrderByWithRelationInput[] =
      INVENTORY_SORT_FIELDS.has(sortBy)
        ? [{ [sortBy]: sortDir }, { title: "asc" }]
        : [{ arrivalDate: "desc" }, { title: "asc" }];

    const [items, total] = await Promise.all([
      prisma.patchInventory.findMany({
        where,
        orderBy: invOrderBy,
        skip,
        take: pageSize,
      }),
      prisma.patchInventory.count({ where }),
    ]);

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

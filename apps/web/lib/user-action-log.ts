import { prisma } from "@/lib/prisma";

export async function recordUserAction({
  username,
  action,
  target,
  details,
}: {
  username: string;
  action: string;
  target: string;
  details: string;
}) {
  await prisma.userActionLog.create({
    data: { username, action, target, details },
  });
}

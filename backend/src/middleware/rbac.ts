import type { Request, Response, NextFunction } from "express";
import { prisma } from "../config/prisma.js";
import { AppError } from "../shared/errors.js";

export type PlatformRole =
  | "blind_user"
  | "mobility_user"
  | "caregiver"
  | "volunteer"
  | "admin";

export function requireRole(
  allowed: PlatformRole | string | Array<PlatformRole | string>,
) {
  const allowedRoles = Array.isArray(allowed) ? allowed : [allowed];
  return (req: Request, _res: Response, next: NextFunction) => {
    const isDev = process.env.NODE_ENV !== "production";
    const userRole =
      req.user?.role ||
      (isDev ? (req.headers["x-user-role"] as string | undefined) : undefined);
    if (!userRole) {
      return next(
        new AppError("UNAUTHENTICATED", "Authentication required.", 401),
      );
    }
    if (!allowedRoles.includes(userRole)) {
      return next(
        new AppError(
          "FORBIDDEN",
          "Anda tidak memiliki izin untuk mengakses fitur ini.",
          403,
        ),
      );
    }
    next();
  };
}

export function requireVerifiedVolunteer() {
    return async (req: Request, _res: Response, next: NextFunction) => {
        try {
            const isDev = process.env.NODE_ENV !== "production";
            const userId =
                req.user?.id ||
                (isDev ? (req.headers["x-user-id"] as string | undefined) : undefined);
            const userRole =
                req.user?.role ||
                (isDev ? (req.headers["x-user-role"] as string | undefined) : undefined);
            
            if (!userId || !userRole) {
                return next(
                    new AppError("UNAUTHENTICATED", "Authentication required.", 401),
                );
            }

            if (userRole !== "volunteer") {
                return next(
                    new AppError(
                        "FORBIDDEN",
                        "You do not have permission to access this feature.",
                        403,
                    ),
                );
            }

            const profile = await prisma.volunteerProfile.findUnique({
                where: { userId },
                select: { verificationStatus: true },
            });

            if (!profile || profile.verificationStatus !== "verified") {
                return next(
                new AppError(
                    "NOT_VERIFIED",
                    "Your volunteer profile is not verified.",
                    403,
                ),
                );
            }
            next();
        } catch (err) {
            next(err);
        }
    }
}


export function requireCapability(capability: "canMapData" | "canCompanion") {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      const isDev = process.env.NODE_ENV !== "production";
      const userId =
        req.user?.id ||
        (isDev ? (req.headers["x-user-id"] as string | undefined) : undefined);
      const userRole =
        req.user?.role ||
        (isDev ? (req.headers["x-user-role"] as string | undefined) : undefined);
      if (!userId || !userRole) {
        return next(
          new AppError("UNAUTHENTICATED", "Authentication required.", 401),
        );
      }
      if (capability === "canMapData" && userRole === "admin") {
        return next();
      }
      if (userRole !== "volunteer") {
        return next(
          new AppError(
            "FORBIDDEN",
            "Your account does not have permission to access this feature.",
            403,
          ),
        );
      }
      const profile = await prisma.volunteerProfile.findUnique({
        where: { userId },
        select: {
          verificationStatus: true,
          canMapData: true,
          canCompanion: true,
        },
      });
      if (!profile || profile.verificationStatus !== "verified") {
        return next(
          new AppError(
            "NOT_VERIFIED",
            "Your volunteer profile is not verified.",
            403,
          ),
        );
      }
      if (!profile[capability]) {
        return next(
          new AppError(
            "FORBIDDEN",
            "Your account does not have permission to access this feature.",
            403,
          ),
        );
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}

export async function assertCanViewLocation(
  viewerId: string,
  targetUserId: string,
): Promise<void> {
  if (viewerId === targetUserId) return;
  const link = await prisma.caregiverRelationship.findUnique({
    where: {
      blindUserId_caregiverId: {
        blindUserId: targetUserId,
        caregiverId: viewerId,
      },
    },
  });
  if (link && link.locationSharingMode === "always") return;
  if (link && link.locationSharingMode === "sos_only") {
    const activeSos = await prisma.sosIncident.findFirst({
      where: {
        userId: targetUserId,
        status: { in: ["active", "responded"] },
      },
      select: { id: true },
    });
    if (activeSos) return;
  }
  const now = new Date();
  const activeCompanion = await prisma.companionRequest.findFirst({
    where: {
      requesterId: targetUserId,
      selectedVolunteerId: viewerId,
      status: "confirmed",
      scheduledStart: { lte: now },
    },
    select: { id: true, scheduledStart: true, estimatedDurationMin: true },
  });
  if (activeCompanion) {
    const endMs =
      activeCompanion.scheduledStart.getTime() +
      (activeCompanion.estimatedDurationMin ?? 60) * 60 * 1000;
    if (now.getTime() <= endMs) return;
  }
  throw new AppError(
    "FORBIDDEN",
    "Your account does not have permission to view this user's location.",
    403,
  );
}

export const requireAdmin = requireRole(["admin"]);
export const requireMapper = requireCapability("canMapData");
export const requireVolunteer = requireRole(["volunteer", "admin"]);
export const requireCaregiver = requireRole(["caregiver", "admin"]);
export const requireTraveler = requireRole([
  "blind_user",
  "mobility_user",
  "admin",
]);
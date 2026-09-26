import type { Request, Response, NextFunction } from "express";

export type PlatformRole = "blind_user" | "mobility_user" | "caregiver" | "volunteer" | "mapper" | "admin"

export function requireRole(allowedRoles: (PlatformRole | string)[]) {
    return (req: Request, res: Response, next: NextFunction) => {
        const isDev = process.env.NODE_ENV !== "production";
        const userRole =
            (req as any).user?.role ||
            (isDev ? (req.headers["x-user-role"] as string) : undefined);

        if (!userRole) {
            return res.status(401).json({
                error: "Unauthorized: Authentication required",
            });
        }
        
        if (!allowedRoles.includes(userRole)) {
            return res.status(403).json({
                error: "Forbidden: Access denied",
            });
        }
        next();
    };
}

export const requireAdmin = requireRole(["admin"]);
export const requireMapper = requireRole(["mapper", "admin"]);
export const requireVolunteer = requireRole(["volunteer", "admin"]);
export const requireCaregiver = requireRole(["caregiver", "admin"]);
export const requireTraveler = requireRole(["blind_user", "mobility_user", "admin"]);
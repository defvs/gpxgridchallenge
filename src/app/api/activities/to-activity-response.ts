import { getSportMeta } from "../../../lib/sports";
import type { Activity } from "../../../lib/types";
import type { ActivityDTO } from "../../../server/activity-storage";

export const toActivityResponse = (dto: ActivityDTO): Activity => {
  const meta = getSportMeta(dto.sport);
  return {
    id: dto.id,
    name: dto.name,
    sport: dto.sport,
    color: meta.color,
    visible: true,
    fileName: dto.fileName,
    points: dto.points,
    distanceKm: dto.distanceKm,
    createdAt: dto.createdAt,
  };
};

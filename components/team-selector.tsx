"use client";

import { useTeam } from "@/components/team-context";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

export function TeamSelector() {
  const { teams, selectedTeam, setSelectedTeamId, loading } = useTeam();

  if (loading) {
    return (
      <div className="h-10 w-56 animate-pulse rounded-md bg-muted" aria-hidden />
    );
  }

  return (
    <div className="flex items-center gap-3">
      <Select
        value={selectedTeam?.id}
        onValueChange={(v) => setSelectedTeamId(v)}
      >
        <SelectTrigger className="w-56">
          <SelectValue placeholder="Selecione um time" />
        </SelectTrigger>
        <SelectContent>
          {teams.map((t) => (
            <SelectItem key={t.id} value={t.id}>
              {t.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {selectedTeam && (
        <Badge variant={selectedTeam.board_type === "scrum" ? "default" : "secondary"}>
          {selectedTeam.board_type === "scrum" ? "Scrum" : "Kanban"}
        </Badge>
      )}
    </div>
  );
}

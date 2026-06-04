"use client";

import * as React from "react";

export type BoardType = "scrum" | "kanban";

export interface Team {
  id: string;
  name: string;
  board_type: BoardType;
  description: string | null;
}

interface TeamContextValue {
  teams: Team[];
  selectedTeam: Team | null;
  setSelectedTeamId: (id: string) => void;
  loading: boolean;
  error: string | null;
}

const TeamContext = React.createContext<TeamContextValue | undefined>(undefined);

const STORAGE_KEY = "status-pilot:selected-team";

export function TeamProvider({ children }: { children: React.ReactNode }) {
  const [teams, setTeams] = React.useState<Team[]>([]);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let active = true;
    fetch("/api/teams")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("Falha ao carregar times"))))
      .then((data: { teams: Team[] }) => {
        if (!active) return;
        setTeams(data.teams);
        const stored =
          typeof window !== "undefined"
            ? window.localStorage.getItem(STORAGE_KEY)
            : null;
        const valid = data.teams.find((t) => t.id === stored);
        setSelectedId(valid ? valid.id : data.teams[0]?.id ?? null);
      })
      .catch((e: Error) => active && setError(e.message))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  const setSelectedTeamId = React.useCallback((id: string) => {
    setSelectedId(id);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, id);
    }
  }, []);

  const selectedTeam = teams.find((t) => t.id === selectedId) ?? null;

  return (
    <TeamContext.Provider
      value={{ teams, selectedTeam, setSelectedTeamId, loading, error }}
    >
      {children}
    </TeamContext.Provider>
  );
}

export function useTeam() {
  const ctx = React.useContext(TeamContext);
  if (!ctx) throw new Error("useTeam deve ser usado dentro de TeamProvider");
  return ctx;
}

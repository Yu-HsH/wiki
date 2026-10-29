// A request remains eligible only until a newer read/mutation or disposal.
// Server versions additionally prevent a new read from regressing known state.
export function createGroupSnapshotGuard() {
    let generation = 0;
    let terminal = false;
    let roomVersion = -1;
    const playerVersions = new Map();
    return {
        begin() { return ++generation; },
        cancel() { generation++; },
        isCurrent(id) { return id === generation; },
        accept(id, room, players = []) {
            if (id !== generation || (terminal && room?.status !== "finished")) return false;
            const version = Number(room?.state_version);
            if (Number.isFinite(version) && version < roomVersion) return false;
            if (players.some(p => Number(p.progress_version) < (playerVersions.get(p.user_id) ?? -1))) return false;
            if (Number.isFinite(version)) roomVersion = version;
            for (const p of players) {
                if (Number.isFinite(Number(p.progress_version))) playerVersions.set(p.user_id, Number(p.progress_version));
            }
            terminal ||= room?.status === "finished";
            return true;
        },
    };
}

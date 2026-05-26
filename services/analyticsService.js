import { supabase, isSupabaseConfigured } from "../supabaseClient";

export async function trackEvent(eventName, payload = {}) {
  if (!isSupabaseConfigured || !supabase || !eventName) return;

  try {
    const {
      user = null,
      pagePath,
      mode = null,
      roomId = null,
      targetTitle = null,
      metadata = {},
    } = payload;

    const isGuest = Boolean(
      user?.isGuest || (typeof user?.id === "string" && user.id.startsWith("guest-"))
    );

    const eventPayload = {
      user_id: user && !isGuest ? user.id : null,
      guest_id: user && isGuest ? user.id : null,
      event_name: eventName,
      page_path:
        pagePath ||
        (typeof window !== "undefined" ? window.location.pathname : null),
      mode,
      room_id: roomId || null,
      target_title: targetTitle || null,
      metadata: metadata || {},
    };

    const { error } = await supabase
      .from("analytics_events")
      .insert(eventPayload);

    if (error) {
      console.warn("Analytics event failed:", error);
    }
  } catch (error) {
    console.warn("Analytics event failed:", error);
  }
}

// Usage:
// trackEvent("single_start", { user, mode: "single", targetTitle });
// trackEvent("single_success", {
//   user,
//   mode: "single",
//   targetTitle,
//   metadata: { elapsedSeconds, clickCount },
// });

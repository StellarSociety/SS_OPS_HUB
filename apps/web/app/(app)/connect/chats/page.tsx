import { MessagesSquare } from "lucide-react";

export default function ConnectChatsPage() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 bg-[#F7F8F2] p-8 text-center">
      <span className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-white text-[var(--venue-primary,#818a40)] shadow-sm">
        <MessagesSquare className="h-8 w-8" aria-hidden />
      </span>
      <p className="font-serif text-2xl text-[#2B2F16]">Your messages</p>
      <p className="max-w-sm text-sm text-black/55">
        Pick a chat on the left, or start a new one to message anyone on the team.
      </p>
    </div>
  );
}

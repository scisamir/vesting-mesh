"use client";
import Welcome from "./Welcome";

export default function Home() {
  return (
    <div className="px-4 py-8 mx-auto bg-[#86efac]">
      <div className="max-w-screen-md mx-auto flex flex-col items-center justify-center">
        <Welcome />
      </div>
    </div>
  );
}

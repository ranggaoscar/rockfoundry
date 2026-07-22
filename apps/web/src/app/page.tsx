"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white">
      {/* Nav */}
      <nav className="border-b border-gray-100">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <span className="text-lg font-semibold tracking-tight">RockFoundry</span>
          <div className="flex items-center gap-3">
            <Link href="/login">
              <Button variant="ghost" size="sm">Log in</Button>
            </Link>
            <Link href="/register">
              <Button size="sm">Get started</Button>
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <main className="max-w-6xl mx-auto px-6 pt-24 pb-32">
        <div className="max-w-3xl">
          <h1 className="text-5xl font-bold tracking-tight leading-tight">
            Stop writing PRDs.<br />
            Start building products.
          </h1>
          <p className="mt-6 text-lg text-gray-600 leading-relaxed max-w-2xl">
            RockFoundry turns your rough product idea into a structured Build Package
            that coding agents like Codex, Claude Code, or Cursor can execute — without
            you writing a single line of technical documentation.
          </p>
          <div className="mt-10 flex items-center gap-4">
            <Link href="/register">
              <Button size="lg">Start for free</Button>
            </Link>
            <span className="text-sm text-gray-500">Self-hosted or cloud. No credit card required.</span>
          </div>
        </div>

        {/* How it works */}
        <div className="mt-32 grid grid-cols-1 md:grid-cols-3 gap-12">
          <div>
            <div className="text-sm font-medium text-gray-400 mb-2">01</div>
            <h3 className="font-semibold text-lg">Describe your idea</h3>
            <p className="mt-2 text-gray-600 text-sm leading-relaxed">
              Write a few sentences about what you want to build. No structure needed — just your raw thoughts.
            </p>
          </div>
          <div>
            <div className="text-sm font-medium text-gray-400 mb-2">02</div>
            <h3 className="font-semibold text-lg">Answer adaptive questions</h3>
            <p className="mt-2 text-gray-600 text-sm leading-relaxed">
              RockFoundry extracts what you said, asks smart questions about what you didn&apos;t,
              and adapts based on your specific product type.
            </p>
          </div>
          <div>
            <div className="text-sm font-medium text-gray-400 mb-2">03</div>
            <h3 className="font-semibold text-lg">Download your Build Package</h3>
            <p className="mt-2 text-gray-600 text-sm leading-relaxed">
              Get a complete folder with PRD, technical specs, data model, task breakdown,
              and agent instructions — ready for any coding agent.
            </p>
          </div>
        </div>

        {/* Pricing */}
        <div className="mt-32 border-t pt-16">
          <h2 className="text-2xl font-bold">Simple pricing</h2>
          <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-8 max-w-2xl">
            <div className="border rounded-lg p-6">
              <h3 className="font-semibold">Community</h3>
              <div className="mt-2 text-3xl font-bold">Free</div>
              <p className="mt-2 text-sm text-gray-600">Self-hosted. Bring your own AI key. Unlimited local projects.</p>
            </div>
            <div className="border rounded-lg p-6 border-gray-900">
              <h3 className="font-semibold">Cloud Starter</h3>
              <div className="mt-2 text-3xl font-bold">Rp49.000<span className="text-sm font-normal text-gray-500">/month</span></div>
              <p className="mt-2 text-sm text-gray-600">Managed AI, cloud storage, reference analysis, 30-day access.</p>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t py-8">
        <div className="max-w-6xl mx-auto px-6 text-sm text-gray-500">
          RockFoundry Alpha v0.1 — Built for indie makers and vibe coders.
        </div>
      </footer>
    </div>
  );
}

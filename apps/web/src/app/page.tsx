"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowRight, Sparkles, Layers, Zap } from "lucide-react";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background dark text-foreground selection:bg-primary/30">
      {/* Abstract Background Elements */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none -z-10">
        <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] rounded-full bg-primary/20 blur-[120px] animate-pulse" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[40%] h-[40%] rounded-full bg-purple-500/10 blur-[120px]" />
      </div>

      {/* Nav */}
      <nav className="glass sticky top-0 z-50 border-b border-white/5">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            <span className="text-lg font-bold tracking-tight text-gradient">RockFoundry</span>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/login" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
              Log in
            </Link>
            <Link href="/register">
              <Button size="sm" className="bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-primary/20 transition-all hover:scale-105 rounded-full px-5">
                Get started
              </Button>
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <main className="max-w-6xl mx-auto px-6 pt-32 pb-32">
        <div className="max-w-4xl text-center mx-auto animate-in slide-in-from-bottom-8 duration-700 fade-in">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full glass border-primary/30 text-primary text-xs font-medium mb-8">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
            </span>
            Alpha v0.2 is live
          </div>
          <h1 className="text-6xl md:text-7xl font-extrabold tracking-tight leading-tight">
            Stop writing PRDs.<br />
            <span className="text-gradient">Start building products.</span>
          </h1>
          <p className="mt-8 text-xl text-muted-foreground leading-relaxed max-w-2xl mx-auto">
            RockFoundry turns your rough product idea into a structured Build Package
            that coding agents like Codex, Claude Code, or Cursor can execute — without
            you writing a single line of technical documentation.
          </p>
          <div className="mt-12 flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link href="/register">
              <Button size="lg" className="h-14 px-8 text-lg rounded-full bg-primary hover:bg-primary/90 shadow-xl shadow-primary/25 transition-all hover:scale-105 group">
                Start building for free
                <ArrowRight className="ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </Button>
            </Link>
            <span className="text-sm text-muted-foreground flex items-center gap-2">
              <Zap className="w-4 h-4" /> Self-hosted or Cloud
            </span>
          </div>
        </div>

        {/* How it works */}
        <div className="mt-40 grid grid-cols-1 md:grid-cols-3 gap-8">
          {[
            { step: "01", title: "Describe your idea", desc: "Write a few sentences about what you want to build. No structure needed — just your raw thoughts." },
            { step: "02", title: "Adaptive Interview", desc: "RockFoundry extracts what you said, asks smart questions about what you didn't, and adapts based on your product type." },
            { step: "03", title: "Export Build Package", desc: "Get a complete ZIP with PRD, technical specs, data model, task breakdown, and agent instructions — ready to execute." }
          ].map((item, i) => (
            <div key={i} className="glass-panel p-8 rounded-2xl hover:border-primary/50 transition-all duration-300 hover:-translate-y-1">
              <div className="text-4xl font-black text-white/5 mb-4">{item.step}</div>
              <h3 className="font-bold text-xl mb-3 text-foreground">{item.title}</h3>
              <p className="text-muted-foreground leading-relaxed">
                {item.desc}
              </p>
            </div>
          ))}
        </div>

        {/* Pricing */}
        <div className="mt-40">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold">Simple, transparent pricing</h2>
            <p className="text-muted-foreground mt-4">Built for indie makers and vibe coders.</p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl mx-auto">
            <div className="glass-panel p-10 rounded-3xl border-white/5 relative overflow-hidden group hover:border-white/10 transition-colors">
              <div className="absolute top-0 right-0 p-6">
                <Layers className="w-8 h-8 text-white/10 group-hover:text-white/20 transition-colors" />
              </div>
              <h3 className="font-semibold text-xl text-muted-foreground">Community</h3>
              <div className="mt-4 text-5xl font-black text-foreground">Free</div>
              <ul className="mt-8 space-y-4 text-muted-foreground">
                <li className="flex items-center gap-3"><div className="w-1.5 h-1.5 rounded-full bg-primary/50" /> Self-hosted</li>
                <li className="flex items-center gap-3"><div className="w-1.5 h-1.5 rounded-full bg-primary/50" /> Bring your own AI key</li>
                <li className="flex items-center gap-3"><div className="w-1.5 h-1.5 rounded-full bg-primary/50" /> Unlimited local projects</li>
              </ul>
            </div>
            
            <div className="glass-panel p-10 rounded-3xl border-primary/30 relative overflow-hidden group">
              <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent z-0" />
              <div className="relative z-10">
                <div className="absolute top-0 right-0 p-6">
                  <Sparkles className="w-8 h-8 text-primary/30 group-hover:text-primary transition-colors" />
                </div>
                <h3 className="font-semibold text-xl text-primary">Cloud Starter</h3>
                <div className="mt-4 text-5xl font-black text-foreground">Rp49k<span className="text-lg font-medium text-muted-foreground">/mo</span></div>
                <ul className="mt-8 space-y-4 text-muted-foreground">
                  <li className="flex items-center gap-3"><div className="w-1.5 h-1.5 rounded-full bg-primary" /> Managed AI Included</li>
                  <li className="flex items-center gap-3"><div className="w-1.5 h-1.5 rounded-full bg-primary" /> Cloud Storage & Sync</li>
                  <li className="flex items-center gap-3"><div className="w-1.5 h-1.5 rounded-full bg-primary" /> Competitor Reference Analysis</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-white/5 py-12">
        <div className="max-w-6xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Sparkles className="w-4 h-4" />
            <span className="text-sm font-medium">RockFoundry Alpha v0.2</span>
          </div>
          <div className="text-sm text-muted-foreground">
            Built for indie makers and vibe coders.
          </div>
        </div>
      </footer>
    </div>
  );
}

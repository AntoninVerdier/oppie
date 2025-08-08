"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { ArrowLeft, TrendingUp, BarChart3 } from "lucide-react";

export default function DomainsPage() {
  const [domainStats, setDomainStats] = useState<any[]>([]);
  const [selectedDomain, setSelectedDomain] = useState<string | null>(null);
  const [domainEvolution, setDomainEvolution] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/domains/stats")
      .then(r => r.json())
      .then(data => {
        setDomainStats(data.stats || []);
        setLoading(false);
      })
      .catch(() => {
        setDomainStats([]);
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    if (selectedDomain) {
      fetch(`/api/domains/stats?domain=${selectedDomain}`)
        .then(r => r.json())
        .then(setDomainEvolution)
        .catch(() => setDomainEvolution(null));
    }
  }, [selectedDomain]);

  if (loading) {
    return (
      <main className="min-h-screen px-6 py-10 mx-auto max-w-6xl">
        <div className="animate-pulse">
          <div className="h-8 w-64 bg-slate-700 rounded mb-4" />
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-32 bg-slate-800 rounded" />
            ))}
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen px-6 py-10 mx-auto max-w-6xl">
      <div className="flex items-center gap-4 mb-8">
        <Link href="/" className="flex items-center gap-2 text-slate-400 hover:text-slate-300">
          <ArrowLeft size={20} />
          Retour
        </Link>
        <h1 className="text-3xl font-semibold">Évolution par domaine</h1>
      </div>

      {selectedDomain ? (
        <div>
          <div className="flex items-center gap-4 mb-6">
            <button 
              onClick={() => setSelectedDomain(null)}
              className="flex items-center gap-2 text-slate-400 hover:text-slate-300"
            >
              <ArrowLeft size={16} />
              Retour aux domaines
            </button>
            <div 
              className="w-4 h-4 rounded-full" 
              style={{ backgroundColor: domainStats.find(d => d.key === selectedDomain)?.color || '#666' }}
            />
            <h2 className="text-2xl font-semibold">
              {domainStats.find(d => d.key === selectedDomain)?.name || selectedDomain}
            </h2>
          </div>

          {domainEvolution ? (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="rounded-lg border border-slate-800 bg-slate-900/70 p-6">
                <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                  <BarChart3 size={20} />
                  Statistiques
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="text-center p-4 rounded border border-slate-700 bg-slate-800">
                    <div className="text-2xl font-bold text-mint-400">
                      {domainEvolution.totalSessions}
                    </div>
                    <div className="text-sm text-slate-400">Sessions</div>
                  </div>
                  <div className="text-center p-4 rounded border border-slate-700 bg-slate-800">
                    <div className="text-2xl font-bold text-mint-400">
                      {(domainEvolution.averageScore * 100).toFixed(1)}%
                    </div>
                    <div className="text-sm text-slate-400">Score moyen</div>
                  </div>
                </div>
              </div>

              <div className="rounded-lg border border-slate-800 bg-slate-900/70 p-6">
                <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                  <TrendingUp size={20} />
                  Évolution
                </h3>
                {domainEvolution.scores.length > 0 ? (
                  <div className="space-y-2">
                    {domainEvolution.scores.map((score: number, index: number) => (
                      <div key={index} className="flex items-center justify-between p-2 rounded border border-slate-700">
                        <span className="text-sm text-slate-300">
                          Session {index + 1}
                        </span>
                        <span className="text-sm font-medium">
                          {(score * 100).toFixed(1)}%
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-slate-400 text-center py-8">
                    Aucune donnée d'évolution disponible
                  </p>
                )}
              </div>
            </div>
          ) : (
            <p className="text-slate-400 text-center py-8">
              Chargement des données d'évolution...
            </p>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {domainStats.map((domain) => (
            <div 
              key={domain.key}
              onClick={() => setSelectedDomain(domain.key)}
              className="rounded-lg border border-slate-800 bg-slate-900/70 p-6 cursor-pointer hover:border-slate-700 transition-colors"
            >
              <div className="flex items-center gap-3 mb-4">
                <div 
                  className="w-6 h-6 rounded-full" 
                  style={{ backgroundColor: domain.color }}
                />
                <h3 className="text-lg font-semibold">{domain.name}</h3>
              </div>
              
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-slate-400">Sessions</span>
                  <span className="text-lg font-semibold">{domain.totalSessions}</span>
                </div>
                
                <div className="flex justify-between items-center">
                  <span className="text-sm text-slate-400">Score moyen</span>
                  <span className="text-lg font-semibold text-mint-400">
                    {(domain.averageScore * 100).toFixed(1)}%
                  </span>
                </div>
                
                <div className="flex justify-between items-center">
                  <span className="text-sm text-slate-400">Dernière session</span>
                  <span className="text-sm text-slate-300">
                    {domain.lastSession ? new Date(domain.lastSession).toLocaleDateString() : 'Jamais'}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}

import { ProjectState, RequirementNode, GraphState } from "../schema";

export class RequirementsEngine {
  private nodes: RequirementNode[];

  constructor(nodes: RequirementNode[]) {
    this.nodes = nodes;
  }

  evaluate(state: ProjectState): GraphState {
    // Determine applicable nodes
    const applicableNodes = this.nodes.filter(node => {
      if (!node.appliesWhen) return true;
      try {
        return node.appliesWhen(state);
      } catch {
        return false;
      }
    });

    // Simple completion tracking
    const completionByCategory: Record<string, number> = {};
    const categories = new Set(applicableNodes.map(n => n.category));
    
    let totalScore = 0;
    let resolvedScore = 0;

    categories.forEach(cat => {
      const catNodes = applicableNodes.filter(n => n.category === cat);
      const catTotal = catNodes.length;
      if (catTotal === 0) {
        completionByCategory[cat] = 100;
        return;
      }
      const catResolved = catNodes.filter(n => 
        ["ANSWERED", "INFERRED", "ASSUMED"].includes(n.status)
      ).length;
      completionByCategory[cat] = Math.round((catResolved / catTotal) * 100);
      
      // Calculate weighted scores for overall readiness
      catNodes.forEach(node => {
        const weight = node.priority * node.riskWeight;
        totalScore += weight;
        if (["ANSWERED", "INFERRED", "ASSUMED"].includes(node.status)) {
          // Discount inferred/assumed based on confidence if needed. For now simple 1x.
          resolvedScore += weight;
        }
      });
    });

    const overallReadinessScore = totalScore === 0 ? 100 : Math.round((resolvedScore / totalScore) * 100);

    // Get top unresolved
    const topUnresolved = applicableNodes
      .filter(n => n.status === "UNRESOLVED" || n.status === "CONFLICTING")
      .sort((a, b) => (b.priority * b.riskWeight) - (a.priority * a.riskWeight))
      .slice(0, 5);

    return {
      applicableNodes,
      completionByCategory,
      overallReadinessScore,
      topUnresolved
    };
  }
}

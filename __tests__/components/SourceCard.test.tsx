/**
 * Component test for SourceCard — verifies rendering of a source citation card.
 */
import { render, screen } from "@testing-library/react";
import SourceCard from "@/components/chat/SourceCard";
import { Source } from "@/lib/types";

describe("SourceCard", () => {
  const slackSource: Source = {
    id: "rec_001",
    title: "Database cutover plan",
    excerpt: "Promoting the Cloud SQL instance tonight.",
    timestamp: "2023-01-15T08:00:00Z",
    platform: "slack",
    metadata: "slack · Alice",
  };

  it("renders title, metadata and excerpt", () => {
    render(<SourceCard source={slackSource} />);
    expect(screen.getByText("Database cutover plan")).toBeInTheDocument();
    expect(screen.getByText("slack · Alice")).toBeInTheDocument();
    expect(screen.getByText(/Promoting the Cloud SQL instance/)).toBeInTheDocument();
  });

  it("renders without crashing for every platform", () => {
    const platforms: Source["platform"][] = ["slack", "github", "jira", "file"];
    for (const platform of platforms) {
      const { unmount } = render(
        <SourceCard source={{ ...slackSource, platform }} />
      );
      expect(screen.getByText("Database cutover plan")).toBeInTheDocument();
      unmount();
    }
  });
});

using Agentica.Lab.Web.Context;
using Agentica.Lab.Web.Contracts;
using Agentica.Lab.Web.Runtime;
using static ProbeSupport;

internal sealed class TerminalFixture : IDisposable
{
    public string Root { get; }
    public HostRunRequest Request { get; }
    public HostActionRequest Action { get; }
    public HostActionResult Admission { get; }
    public HostOperationEvent Handshake { get; }
    public HostOperationEvent Progress { get; }
    public HostRunUsage ServiceUsage { get; }
    public ActionCustodyStore Custody { get; private set; }
    public HostOperationStore Operations { get; private set; }
    public HostRunRegistry Registry { get; private set; }
    public ForbiddenPlannerFactory Planners { get; } = new();
    public List<object> Rejections { get; } = [];
    private string Ledger => Path.Combine(Root, "operations", HostOperationStore.LedgerFileName);

    public TerminalFixture(string root, bool exhausted = false, int deliveredSequence = 2)
    {
        Require(deliveredSequence is >= 0 and <= 2, "Fixture prefix must end at admission, probe or progress.");
        Root = root;
        Request = ProbeInputs.Request() with { Limits = new HostRunLimits(MaxSteps: 4, MaxRefinements: 0, MaxPlanContinuations: 1) };
        Action = ProbeInputs.Action(Request);
        Admission = ProbeInputs.Admission(Action);
        ServiceUsage = exhausted ? new HostRunUsage(Steps: 4, Continuations: 1) : new();
        var contexts = new HostContextStore(Path.Combine(root, "contexts"));
        Custody = new ActionCustodyStore(Path.Combine(root, "custody"));
        Operations = new HostOperationStore(Path.Combine(root, "operations"));
        Registry = new HostRunRegistry(contexts, Planners, Custody, Operations);
        var context = contexts.Open(Request);
        context.RecordActionDispatch(Action);
        Operations.Reserve(Request, Action, ServiceUsage);
        Custody.Reserve(Request.HostId, Request.SessionId, Request.SessionEpoch, Action.RunId, Action, Request.Capabilities[0], Request.ObjectiveId);
        Operations.Admit(Request.HostId, Request.SessionId, Admission);
        context.RecordActionResult(Action, Admission);
        Custody.Resolve(Request.HostId, Request.SessionId, Action.ActionId, Admission);
        Handshake = ProbeInputs.Progress(Request, Admission);
        if (deliveredSequence >= 1) Registry.ApplyOperationEvent(Handshake);
        Progress = Handshake with
        {
            Sequence = 2, EventId = "terminal-probe-progress-seq2",
            Observation = ProbeInputs.Observation("terminal-probe-progress-observation", 2) with
            {
                Data = HostProtocol.Element(new { actor = new { level = 1, spaceId = "fixture-room", row = 0, column = 1 }, steps = 1 })
            },
            Summary = "Synthetic host progress: one step; no actual Maze engine is invoked.",
            Usage = HostProtocol.Element(new { steps = 1 })
        };
        if (deliveredSequence == 2)
        {
            var progress = Registry.ApplyOperationEvent(Progress);
            Require(progress.State == "parked" && progress.WakeRunId is null, "Progress activated cognition or became terminal.");
            Require(ProtocolValidation.Digest(progress.LatestEvent!) == ProtocolValidation.Digest(Progress), "Nonzero progress was not retained exactly.");
            Require(ProtocolValidation.Digest(context.CurrentObservation) == ProtocolValidation.Digest(Progress.Observation), "Progress observation was not published.");
            Require(progress.Usage == ServiceUsage, "Host progress changed service cognitive usage.");
            Replay(Progress, progress);
        }
    }

    public HostOperationEvent Terminal(string kind) => Progress with
    {
        Sequence = 3, EventId = "terminal-probe-" + kind + "-seq3", Kind = kind,
        Summary = "Synthetic host " + kind + " evidence after one reported step.",
        Completion = kind == "completed" ? new HostCompletion(Request.ObjectiveId, "separate-terminal-evidence",
            "Synthetic objective proof supplied for protocol validation; arrival alone is not completion.") : null
    };

    public void Reject(string name, string code, Action call)
    {
        var before = StoreSnapshot(Root);
        try { call(); throw new InvalidOperationException(name + " unexpectedly accepted."); }
        catch (HostProtocolException error) { Require(error.Code == code, name + ": expected " + code + ", got " + error.Code); }
        Require(StoreSnapshot(Root) == before, name + " changed durable stores.");
        Rejections.Add(new { name, code, storesUnchanged = true });
        AssertNoExecution();
    }

    public void Replay(HostOperationEvent item, HostOperationEntry expected)
    {
        var before = Hash(Ledger);
        var actual = Registry.ApplyOperationEvent(item);
        Require(ProtocolValidation.Digest(actual) == ProtocolValidation.Digest(expected), "Exact replay changed its response.");
        Require(Hash(Ledger) == before, "Exact replay rewrote the operation ledger.");
        AssertNoExecution();
    }

    public HostOperationEntry Inventory()
    {
        var before = StoreSnapshot(Root);
        var item = Registry.ListOperations(Request.HostId, Request.SessionId).Single();
        Require(StoreSnapshot(Root) == before, "Inventory changed durable stores.");
        return item;
    }

    public void Restart()
    {
        Registry.Dispose();
        Custody = new ActionCustodyStore(Path.Combine(Root, "custody"));
        Operations = new HostOperationStore(Path.Combine(Root, "operations"));
        Registry = new HostRunRegistry(new HostContextStore(Path.Combine(Root, "contexts")), Planners, Custody, Operations);
    }

    public void AssertNoExecution() => Require(Registry.List().Length == 0 && Planners.CreateCalls == 0 && Planners.MetadataCalls == 0,
        "Terminal probe activated a run, planner or provider.");

    public void Dispose() { AssertNoExecution(); Registry.Dispose(); }
}

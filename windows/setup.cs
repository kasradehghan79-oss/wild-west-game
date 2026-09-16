/* ==========================================================================
   The Wild West - windows/setup.cs
   The Windows installer.

   It is compiled by windows/build_setup.py straight from this file, using the
   C# compiler and .NET Framework that ship inside Windows itself, so building
   it needs no downloads and running it needs no administrator: everything goes
   into the user's own %LOCALAPPDATA%\Programs, the shortcuts into the user's
   own Start Menu, and the Add/Remove Programs entry into HKCU.

   The game is carried inside the executable as an embedded zip
   (payload.zip). The world is a plain web build that runs from file:// - no
   server, no XHR, no network - so the "app" is the build plus a window to see
   it in: the shortcut opens Microsoft Edge's application mode, which every
   Windows 10 and 11 machine already has, giving the game its own chrome-free
   window, its own taskbar entry and its own icon.

   The same executable is copied in as Uninstall.exe, so --uninstall removes
   the shortcuts, the registry entry and then the folder itself.

   Provides:  the setup and uninstaller for the Windows build
   Expects:   __VERSION__ (substituted by build_setup.py), payload.zip and
              brand.ico next to it at compile time
   ========================================================================== */
using System;
using System.ComponentModel;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.IO.Compression;
using System.Reflection;
using System.Windows.Forms;
using Microsoft.Win32;

[assembly: AssemblyTitle("The Wild West")]
[assembly: AssemblyProduct("The Wild West")]
[assembly: AssemblyCompany("Kasra_dn")]
[assembly: AssemblyDescription("Bounty hunter: outlaw or dead")]
[assembly: AssemblyVersion("__VERSION__")]
[assembly: AssemblyFileVersion("__VERSION__")]

static class Setup
{
    const string GameName = "The Wild West";
    const string Version = "__VERSION__";
    const string UninstallKey = @"Software\Microsoft\Windows\CurrentVersion\Uninstall\TheWildWest";
    const string Payload = "payload.zip";

    // the installer's own palette, the same ink and gold as the game
    static readonly Color Ink = Color.FromArgb(36, 28, 18);
    static readonly Color Gold = Color.FromArgb(212, 175, 55);
    static readonly Color Cream = Color.FromArgb(240, 216, 168);

    static string DefaultDir()
    {
        return Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            @"Programs\" + GameName);
    }

    static bool Has(string[] args, string name)
    {
        foreach (string a in args)
            if (string.Equals(a, name, StringComparison.OrdinalIgnoreCase)) return true;
        return false;
    }

    static string Value(string[] args, string name)
    {
        foreach (string a in args)
            if (a.StartsWith(name + "=", StringComparison.OrdinalIgnoreCase))
                return a.Substring(name.Length + 1).Trim('"');
        return null;
    }

    [STAThread]
    static void Main(string[] args)
    {
        if (Has(args, "--uninstall"))
        {
            Uninstall(Has(args, "--silent"));
            return;
        }

        string dir = Value(args, "--dir");
        if (dir == null) dir = DefaultDir();

        bool portable = Has(args, "--portable");
        if (Has(args, "--silent") || portable)
        {
            // --portable unpacks the game and nothing else: no shortcuts, no
            // registry entry. It is what the build self test uses, and it is a
            // reasonable thing for a player to want on a shared machine.
            Install(dir, !portable, Has(args, "--start"), null, portable);
            return;
        }

        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);
        Application.Run(new SetupForm(dir));
    }

    // ---------------------------------------------------------------- install

    static void Install(string dir, bool desktop, bool startAfter, BackgroundWorker worker, bool portable)
    {
        Directory.CreateDirectory(dir);
        Report(worker, 8, "Unpacking the game...");

        string zip = Path.Combine(Path.GetTempPath(), "wildwest-" + Guid.NewGuid().ToString("N") + ".zip");
        using (Stream res = Assembly.GetExecutingAssembly().GetManifestResourceStream(Payload))
        {
            if (res == null) throw new InvalidOperationException("the game payload is missing from this installer");
            using (FileStream outFile = File.Create(zip)) res.CopyTo(outFile);
        }

        using (ZipArchive archive = ZipFile.OpenRead(zip))
        {
            int done = 0;
            foreach (ZipArchiveEntry entry in archive.Entries)
            {
                if (string.IsNullOrEmpty(entry.Name)) continue;   // a directory
                string target = Path.Combine(dir, entry.FullName.Replace('/', Path.DirectorySeparatorChar));
                Directory.CreateDirectory(Path.GetDirectoryName(target));
                entry.ExtractToFile(target, true);
                done++;
                Report(worker, 8 + (int)(62.0 * done / archive.Entries.Count), null);
            }
        }
        File.Delete(zip);

        if (portable)
        {
            Report(worker, 100, "Done.");
            return;
        }

        Report(worker, 76, "Installing the uninstaller...");
        string self = Assembly.GetExecutingAssembly().Location;
        string uninstaller = Path.Combine(dir, "Uninstall.exe");
        if (!string.Equals(self, uninstaller, StringComparison.OrdinalIgnoreCase))
        {
            File.Copy(self, uninstaller, true);
        }

        Report(worker, 84, "Making shortcuts...");
        Shortcut(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Programs), GameName + ".lnk"), dir);
        if (desktop)
            Shortcut(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory), GameName + ".lnk"), dir);

        Report(worker, 92, "Registering with Windows...");
        RegistryKey key = Registry.CurrentUser.CreateSubKey(UninstallKey);
        if (key != null)
        {
            key.SetValue("DisplayName", GameName);
            key.SetValue("DisplayVersion", Version);
            key.SetValue("Publisher", "Kasra_dn");
            key.SetValue("DisplayIcon", uninstaller);
            key.SetValue("InstallLocation", dir);
            key.SetValue("UninstallString", "\"" + uninstaller + "\" --uninstall");
            key.SetValue("NoModify", 1, RegistryValueKind.DWord);
            key.SetValue("NoRepair", 1, RegistryValueKind.DWord);
            key.SetValue("EstimatedSize", SizeInKb(dir), RegistryValueKind.DWord);
            key.Close();
        }

        Report(worker, 100, "Done.");
        if (startAfter) Launch(dir);
    }

    static int SizeInKb(string dir)
    {
        long total = 0;
        foreach (string file in Directory.GetFiles(dir, "*", SearchOption.AllDirectories))
        {
            try { total += new FileInfo(file).Length; } catch (IOException) { }
        }
        return (int)(total / 1024);
    }

    static void Report(BackgroundWorker worker, int percent, string status)
    {
        if (worker == null) return;
        worker.ReportProgress(percent, status);
    }

    // -------------------------------------------------------------- shortcuts

    /// <summary>Edge is on every Windows 10 and 11 machine; its application mode
    /// gives the game a window of its own instead of a browser tab.</summary>
    static string Edge()
    {
        string[] keys = {
            @"HKEY_LOCAL_MACHINE\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\msedge.exe",
            @"HKEY_CURRENT_USER\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\msedge.exe"
        };
        foreach (string k in keys)
        {
            object v = Registry.GetValue(k, "", null);
            if (v != null)
            {
                string path = v.ToString().Trim('"');
                if (File.Exists(path)) return path;
            }
        }
        string[] guesses = {
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86),
                @"Microsoft\Edge\Application\msedge.exe"),
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles),
                @"Microsoft\Edge\Application\msedge.exe")
        };
        foreach (string g in guesses) if (File.Exists(g)) return g;
        return null;
    }

    /// <summary>Both the shortcut and a direct launch go through here, so there
    /// is one answer to "how does this game start on Windows".</summary>
    static void StartGame(string dir)
    {
        string html = Path.Combine(dir, "index.html");
        string edge = Edge();
        ProcessStartInfo info;
        if (edge != null)
            info = new ProcessStartInfo(edge, "--app=\"" + new Uri(html).AbsoluteUri + "\"");
        else
            info = new ProcessStartInfo(html);     // the shell picks the default browser
        info.UseShellExecute = true;
        info.WorkingDirectory = dir;
        Process.Start(info);
    }

    static void Launch(string dir)
    {
        try { StartGame(dir); }
        catch (Exception e) { MessageBox.Show("The game is installed, but could not be started: " + e.Message); }
    }

    static void Shortcut(string lnkPath, string dir)
    {
        string html = Path.Combine(dir, "index.html");
        string edge = Edge();
        object shell = Activator.CreateInstance(Type.GetTypeFromProgID("WScript.Shell"));
        object link = shell.GetType().InvokeMember("CreateShortcut", BindingFlags.InvokeMethod, null, shell,
            new object[] { lnkPath });
        Type t = link.GetType();
        Action<string, object> set = delegate(string name, object value)
        {
            t.InvokeMember(name, BindingFlags.SetProperty, null, link, new object[] { value });
        };
        if (edge != null)
        {
            set("TargetPath", edge);
            set("Arguments", "--app=\"" + new Uri(html).AbsoluteUri + "\"");
        }
        else
        {
            set("TargetPath", html);
        }
        set("WorkingDirectory", dir);
        set("IconLocation", Path.Combine(dir, "Uninstall.exe") + ",0");
        set("Description", GameName);
        t.InvokeMember("Save", BindingFlags.InvokeMethod, null, link, null);
    }

    // -------------------------------------------------------------- uninstall

    /// <summary>The folder to remove: read from the registry entry the install
    /// wrote, so a copy of this executable kept anywhere - the Uninstall.exe in
    /// the install folder, or one a player saved elsewhere - removes the same
    /// thing. Falling back to our own folder keeps an install made before that
    /// entry existed removable.</summary>
    static string InstalledDir()
    {
        try
        {
            using (RegistryKey key = Registry.CurrentUser.OpenSubKey(UninstallKey))
            {
                if (key != null)
                {
                    string where = key.GetValue("InstallLocation") as string;
                    if (!string.IsNullOrEmpty(where) && File.Exists(Path.Combine(where, "index.html")))
                        return where;
                }
            }
        }
        catch (Exception) { }
        return Path.GetDirectoryName(Application.ExecutablePath);
    }

    static void Uninstall(bool silent)
    {
        string dir = InstalledDir();
        if (!silent)
        {
            DialogResult answer = MessageBox.Show("Remove " + GameName + " and its shortcuts?",
                GameName, MessageBoxButtons.YesNo, MessageBoxIcon.Question);
            if (answer != DialogResult.Yes) return;
        }

        Delete(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Programs), GameName + ".lnk"));
        Delete(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory), GameName + ".lnk"));
        try { Registry.CurrentUser.DeleteSubKeyTree(UninstallKey, false); }
        catch (Exception) { }

        if (!silent)
            MessageBox.Show("The game has been removed.", GameName, MessageBoxButtons.OK, MessageBoxIcon.Information);

        // A running executable cannot delete its own folder: hand the job to a
        // shell that waits for this process to go away first.
        if (dir != null && File.Exists(Path.Combine(dir, "index.html")))
        {
            ProcessStartInfo info = new ProcessStartInfo("cmd.exe",
                "/c ping -n 3 127.0.0.1 >nul & rmdir /s /q \"" + dir + "\"");
            info.CreateNoWindow = true;
            info.UseShellExecute = false;
            info.WindowStyle = ProcessWindowStyle.Hidden;
            Process.Start(info);
        }
    }

    static void Delete(string file)
    {
        try { if (File.Exists(file)) File.Delete(file); }
        catch (Exception) { }
    }

    // --------------------------------------------------------------------- ui

    sealed class SetupForm : Form
    {
        readonly string _dir;
        readonly TextBox _path;
        readonly CheckBox _desktop;
        readonly CheckBox _start;
        readonly ProgressBar _bar;
        readonly Label _status;
        readonly Button _go;
        readonly BackgroundWorker _worker;
        readonly int _titleHeight;

        public SetupForm(string dir)
        {
            _dir = dir;
            Text = GameName + " - Setup";
            ClientSize = new Size(540, 288);
            FormBorderStyle = FormBorderStyle.FixedDialog;
            MaximizeBox = false;
            MinimizeBox = false;
            StartPosition = FormStartPosition.CenterScreen;
            BackColor = Ink;
            ForeColor = Cream;
            Font = new Font("Segoe UI", 9f);
            try { Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath); }
            catch (Exception) { }

            Label title = new Label();
            title.Text = GameName;
            title.Font = new Font("Segoe UI Semibold", 19f, FontStyle.Bold);
            title.ForeColor = Cream;
            title.AutoSize = true;
            title.Location = new Point(24, 20);
            Controls.Add(title);
            _titleHeight = title.PreferredHeight;

            Label sub = new Label();
            sub.Text = "Bounty hunter: outlaw or dead      version " + Version;
            sub.ForeColor = Gold;
            sub.AutoSize = true;
            sub.Location = new Point(26, 20 + _titleHeight + 2);
            Controls.Add(sub);

            Label where = new Label();
            where.Text = "Install to";
            where.AutoSize = true;
            where.ForeColor = Color.FromArgb(184, 171, 143);
            where.Location = new Point(26, 100);
            Controls.Add(where);

            _path = new TextBox();
            _path.Text = dir;
            _path.Location = new Point(28, 120);
            _path.Width = 400;
            _path.BackColor = Color.FromArgb(18, 13, 8);
            _path.ForeColor = Cream;
            _path.BorderStyle = BorderStyle.FixedSingle;
            Controls.Add(_path);

            Button browse = new Button();
            browse.Text = "Change...";
            browse.Location = new Point(436, 119);
            browse.Size = new Size(80, 24);
            browse.FlatStyle = FlatStyle.Flat;
            browse.FlatAppearance.BorderColor = Gold;
            browse.ForeColor = Cream;
            browse.BackColor = Color.FromArgb(48, 34, 18);
            browse.Click += delegate
            {
                FolderBrowserDialog pick = new FolderBrowserDialog();
                pick.Description = "Where should " + GameName + " be installed?";
                pick.SelectedPath = _path.Text;
                if (pick.ShowDialog() == DialogResult.OK) _path.Text = Path.Combine(pick.SelectedPath, GameName);
            };
            Controls.Add(browse);

            _desktop = new CheckBox();
            _desktop.Text = "Put a shortcut on the desktop";
            _desktop.Location = new Point(28, 156);
            _desktop.AutoSize = true;
            _desktop.ForeColor = Cream;
            Controls.Add(_desktop);

            _start = new CheckBox();
            _start.Text = "Start the game when it is installed";
            _start.Location = new Point(28, 180);
            _start.AutoSize = true;
            _start.Checked = true;
            _start.ForeColor = Cream;
            Controls.Add(_start);

            _status = new Label();
            _status.Text = "Ready when you are.";
            _status.AutoSize = false;
            _status.Size = new Size(320, 20);
            _status.ForeColor = Color.FromArgb(184, 171, 143);
            _status.Location = new Point(28, 212);
            Controls.Add(_status);

            _bar = new ProgressBar();
            _bar.Location = new Point(28, 232);
            _bar.Size = new Size(380, 12);
            _bar.Style = ProgressBarStyle.Continuous;
            _bar.Maximum = 100;
            _bar.Visible = false;
            Controls.Add(_bar);

            _go = new Button();
            _go.Text = "Install";
            _go.Location = new Point(336, 254);
            _go.Size = new Size(88, 28);
            _go.FlatStyle = FlatStyle.Flat;
            _go.FlatAppearance.BorderColor = Gold;
            _go.BackColor = Color.FromArgb(74, 56, 24);
            _go.ForeColor = Color.White;
            _go.Click += delegate { Begin(); };
            Controls.Add(_go);

            Button close = new Button();
            close.Text = "Close";
            close.Location = new Point(430, 254);
            close.Size = new Size(86, 28);
            close.FlatStyle = FlatStyle.Flat;
            close.FlatAppearance.BorderColor = Color.FromArgb(90, 74, 46);
            close.BackColor = Color.FromArgb(40, 28, 14);
            close.ForeColor = Cream;
            close.Click += delegate { Close(); };
            Controls.Add(close);

            AcceptButton = _go;

            _worker = new BackgroundWorker();
            _worker.WorkerReportsProgress = true;
            _worker.DoWork += delegate(object s, DoWorkEventArgs e)
            {
                Install((string)e.Argument, _desktop.Checked, false, _worker, false);
            };
            _worker.ProgressChanged += delegate(object s, ProgressChangedEventArgs e)
            {
                _bar.Value = Math.Min(100, Math.Max(0, e.ProgressPercentage));
                if (e.UserState != null) _status.Text = (string)e.UserState;
            };
            _worker.RunWorkerCompleted += delegate(object s, RunWorkerCompletedEventArgs e)
            {
                if (e.Error != null)
                {
                    _status.Text = "Installation failed.";
                    MessageBox.Show(this, e.Error.Message, GameName, MessageBoxButtons.OK, MessageBoxIcon.Error);
                    _go.Enabled = true;
                    _go.Text = "Try again";
                    return;
                }
                _status.Text = "Installed. Starting the game...";
                _go.Enabled = false;
                if (_start.Checked) Launch(_path.Text);
                Close();
            };
        }

        void Begin()
        {
            string dir = _path.Text.Trim().Trim('"');
            if (dir.Length == 0) { MessageBox.Show(this, "Choose a folder first.", GameName); return; }
            _go.Enabled = false;
            _go.Text = "Installing";
            _bar.Value = 0;
            _bar.Visible = true;
            _status.Text = "Working...";
            _worker.RunWorkerAsync(dir);
        }
    }
}

param(
    [Parameter(Mandatory = $true)]
    [ValidateSet("list_windows", "activate", "snapshot", "screenshot", "focus", "set_value", "click", "type", "key", "open_url", "scroll", "drag", "move", "self_test")]
    [string]$Action,

    [string]$Payload = "e30="
)

Set-StrictMode -Off
$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)

Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
Add-Type -AssemblyName System.Drawing

if (-not ("DshComputerUse.Native" -as [type])) {
    Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;

namespace DshComputerUse {
    public static class Native {
        public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

        [StructLayout(LayoutKind.Sequential)]
        public struct RECT {
            public int Left;
            public int Top;
            public int Right;
            public int Bottom;
        }

        [StructLayout(LayoutKind.Sequential)]
        public struct POINT {
            public int X;
            public int Y;
        }

        [StructLayout(LayoutKind.Sequential)]
        public struct MOUSEINPUT {
            public int dx;
            public int dy;
            public uint mouseData;
            public uint dwFlags;
            public uint time;
            public UIntPtr dwExtraInfo;
        }

        [StructLayout(LayoutKind.Sequential)]
        public struct KEYBDINPUT {
            public ushort wVk;
            public ushort wScan;
            public uint dwFlags;
            public uint time;
            public UIntPtr dwExtraInfo;
        }

        [StructLayout(LayoutKind.Explicit)]
        public struct INPUTUNION {
            [FieldOffset(0)] public MOUSEINPUT mi;
            [FieldOffset(0)] public KEYBDINPUT ki;
        }

        [StructLayout(LayoutKind.Sequential)]
        public struct INPUT {
            public uint type;
            public INPUTUNION U;
        }

        [DllImport("user32.dll")]
        public static extern bool EnumWindows(EnumWindowsProc callback, IntPtr extraData);

        [DllImport("user32.dll")]
        public static extern bool IsWindowVisible(IntPtr hWnd);

        [DllImport("user32.dll")]
        public static extern bool IsIconic(IntPtr hWnd);

        [DllImport("user32.dll", CharSet = CharSet.Unicode)]
        public static extern int GetWindowTextLength(IntPtr hWnd);

        [DllImport("user32.dll", CharSet = CharSet.Unicode)]
        public static extern int GetWindowText(IntPtr hWnd, System.Text.StringBuilder text, int count);

        [DllImport("user32.dll", CharSet = CharSet.Unicode)]
        public static extern int GetClassName(IntPtr hWnd, System.Text.StringBuilder className, int count);

        [DllImport("user32.dll")]
        public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);

        [DllImport("user32.dll")]
        public static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);

        [DllImport("user32.dll")]
        public static extern IntPtr GetForegroundWindow();

        [DllImport("user32.dll")]
        public static extern bool SetForegroundWindow(IntPtr hWnd);

        [DllImport("user32.dll")]
        public static extern bool ShowWindow(IntPtr hWnd, int command);

        [DllImport("user32.dll")]
        public static extern bool SetCursorPos(int x, int y);

        [DllImport("user32.dll")]
        public static extern bool GetCursorPos(out POINT point);

        [DllImport("user32.dll")]
        public static extern void mouse_event(uint flags, uint dx, uint dy, int data, UIntPtr extraInfo);

        [DllImport("user32.dll")]
        public static extern void keybd_event(byte virtualKey, byte scanCode, uint flags, UIntPtr extraInfo);

        [DllImport("user32.dll", SetLastError = true)]
        public static extern uint SendInput(uint inputCount, INPUT[] inputs, int inputSize);

        [DllImport("user32.dll")]
        public static extern bool SetProcessDPIAware();

        [DllImport("dwmapi.dll")]
        public static extern int DwmGetWindowAttribute(IntPtr hWnd, int attribute, out RECT rect, int size);

        public const int SW_RESTORE = 9;
        public const uint MOUSEEVENTF_LEFTDOWN = 0x0002;
        public const uint MOUSEEVENTF_LEFTUP = 0x0004;
        public const uint MOUSEEVENTF_RIGHTDOWN = 0x0008;
        public const uint MOUSEEVENTF_RIGHTUP = 0x0010;
        public const uint MOUSEEVENTF_MIDDLEDOWN = 0x0020;
        public const uint MOUSEEVENTF_MIDDLEUP = 0x0040;
        public const uint MOUSEEVENTF_WHEEL = 0x0800;
        public const uint KEYEVENTF_KEYUP = 0x0002;
        public const uint KEYEVENTF_UNICODE = 0x0004;
        public const uint INPUT_KEYBOARD = 1;

        public static uint SendUnicodeText(string text) {
            if (text == null || text.Length == 0) return 0;
            uint sent = 0;
            int offset = 0;
            while (offset < text.Length) {
                int count = Math.Min(256, text.Length - offset);
                INPUT[] inputs = new INPUT[count * 2];
                for (int index = 0; index < count; index++) {
                    ushort codeUnit = (ushort)text[offset + index];
                    INPUT down = new INPUT();
                    down.type = INPUT_KEYBOARD;
                    down.U.ki.wScan = codeUnit;
                    down.U.ki.dwFlags = KEYEVENTF_UNICODE;
                    inputs[index * 2] = down;

                    INPUT up = new INPUT();
                    up.type = INPUT_KEYBOARD;
                    up.U.ki.wScan = codeUnit;
                    up.U.ki.dwFlags = KEYEVENTF_UNICODE | KEYEVENTF_KEYUP;
                    inputs[index * 2 + 1] = up;
                }
                uint result = SendInput((uint)inputs.Length, inputs, Marshal.SizeOf(typeof(INPUT)));
                if (result != (uint)inputs.Length) {
                    return sent + result;
                }
                sent += (uint)count;
                offset += count;
            }
            return sent;
        }
    }
}
'@
}

[void][DshComputerUse.Native]::SetProcessDPIAware()

function Get-Payload {
    if ([string]::IsNullOrWhiteSpace($Payload)) {
        return [pscustomobject]@{}
    }
    $json = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($Payload))
    if ([string]::IsNullOrWhiteSpace($json)) {
        return [pscustomobject]@{}
    }
    return $json | ConvertFrom-Json
}

function Get-WindowTitle([IntPtr]$Handle) {
    $length = [DshComputerUse.Native]::GetWindowTextLength($Handle)
    if ($length -le 0) {
        return ""
    }
    $builder = [System.Text.StringBuilder]::new($length + 1)
    [void][DshComputerUse.Native]::GetWindowText($Handle, $builder, $builder.Capacity)
    return $builder.ToString()
}

function Get-WindowClassName([IntPtr]$Handle) {
    $builder = [System.Text.StringBuilder]::new(256)
    [void][DshComputerUse.Native]::GetClassName($Handle, $builder, $builder.Capacity)
    return $builder.ToString()
}

function Get-WindowBounds([IntPtr]$Handle) {
    $rect = [DshComputerUse.Native+RECT]::new()
    $hr = [DshComputerUse.Native]::DwmGetWindowAttribute(
        $Handle,
        9,
        [ref]$rect,
        [Runtime.InteropServices.Marshal]::SizeOf($rect)
    )
    if ($hr -ne 0 -or $rect.Right -le $rect.Left -or $rect.Bottom -le $rect.Top) {
        if (-not [DshComputerUse.Native]::GetWindowRect($Handle, [ref]$rect)) {
            throw "Unable to read the target window bounds."
        }
    }
    return [pscustomobject]@{
        left = $rect.Left
        top = $rect.Top
        width = $rect.Right - $rect.Left
        height = $rect.Bottom - $rect.Top
    }
}

function Get-VisibleWindows($InputObject) {
    $foreground = [DshComputerUse.Native]::GetForegroundWindow()
    $items = [System.Collections.Generic.List[object]]::new()
    $callback = [DshComputerUse.Native+EnumWindowsProc]{
        param([IntPtr]$handle, [IntPtr]$unused)
        if (-not [DshComputerUse.Native]::IsWindowVisible($handle)) {
            return $true
        }
        $title = Get-WindowTitle $handle
        $className = Get-WindowClassName $handle
        $isTaskbar = $className -in @("Shell_TrayWnd", "Shell_SecondaryTrayWnd")
        if ([string]::IsNullOrWhiteSpace($title) -and -not $isTaskbar) {
            return $true
        }
        if ($isTaskbar) {
            $title = "Taskbar"
        }

        [uint32]$processId = 0
        [void][DshComputerUse.Native]::GetWindowThreadProcessId($handle, [ref]$processId)
        $processName = ""
        $processPath = ""
        try {
            $process = Get-Process -Id $processId -ErrorAction Stop
            $processName = $process.ProcessName
            $processPath = $process.Path
        } catch {}

        try {
            $bounds = Get-WindowBounds $handle
            $items.Add([pscustomobject]@{
                handle = $handle.ToInt64()
                title = $title
                className = $className
                processId = [int]$processId
                processName = $processName
                processPath = $processPath
                foreground = $handle -eq $foreground
                minimized = [DshComputerUse.Native]::IsIconic($handle)
                bounds = $bounds
            })
        } catch {}
        return $true
    }

    if (-not [DshComputerUse.Native]::EnumWindows($callback, [IntPtr]::Zero)) {
        throw "Unable to enumerate Windows."
    }
    $result = @($items | Sort-Object @{ Expression = "foreground"; Descending = $true }, title)
    $query = [string]$InputObject.query
    if (-not [string]::IsNullOrWhiteSpace($query)) {
        $needle = $query.ToLowerInvariant()
        $result = @($result | Where-Object {
            $_.title.ToLowerInvariant().Contains($needle) -or
            $_.processName.ToLowerInvariant().Contains($needle)
        })
    }
    $limit = if ($null -ne $InputObject.limit) { [int]$InputObject.limit } else { 50 }
    if ($limit -gt 0 -and $result.Count -gt $limit) {
        $result = @($result | Select-Object -First $limit)
    }
    return $result
}

function Get-WindowHandle($InputObject) {
    if ($null -eq $InputObject.handle) {
        throw "A window handle is required."
    }
    $handle = [IntPtr]([long]$InputObject.handle)
    if ($handle -eq [IntPtr]::Zero) {
        throw "The window handle is invalid."
    }
    return $handle
}

function Activate-Window([IntPtr]$Handle) {
    if ([DshComputerUse.Native]::IsIconic($Handle)) {
        [void][DshComputerUse.Native]::ShowWindow($Handle, [DshComputerUse.Native]::SW_RESTORE)
    }
    [void][DshComputerUse.Native]::SetForegroundWindow($Handle)
    Start-Sleep -Milliseconds 120
    return [pscustomobject]@{
        handle = $Handle.ToInt64()
        title = Get-WindowTitle $Handle
        bounds = Get-WindowBounds $Handle
    }
}

function Get-ControlChildren($Element) {
    $children = [System.Collections.Generic.List[System.Windows.Automation.AutomationElement]]::new()
    $walker = [System.Windows.Automation.TreeWalker]::ControlViewWalker
    $child = $walker.GetFirstChild($Element)
    while ($null -ne $child) {
        $children.Add($child)
        $child = $walker.GetNextSibling($child)
    }
    return @($children)
}

function Get-PatternNames($Element) {
    $names = [System.Collections.Generic.List[string]]::new()
    $checks = @(
        @("Invoke", [System.Windows.Automation.InvokePattern]::Pattern),
        @("Toggle", [System.Windows.Automation.TogglePattern]::Pattern),
        @("SelectionItem", [System.Windows.Automation.SelectionItemPattern]::Pattern),
        @("ExpandCollapse", [System.Windows.Automation.ExpandCollapsePattern]::Pattern),
        @("Value", [System.Windows.Automation.ValuePattern]::Pattern),
        @("ScrollItem", [System.Windows.Automation.ScrollItemPattern]::Pattern)
    )
    foreach ($check in $checks) {
        try {
            $patternObject = $null
            if ($Element.TryGetCurrentPattern($check[1], [ref]$patternObject)) {
                $names.Add([string]$check[0])
            }
        } catch {}
    }
    return @($names)
}

function Test-FiniteNumber($Value) {
    if ($null -eq $Value) {
        return $false
    }
    try {
        $number = [double]$Value
        return -not [double]::IsNaN($number) -and -not [double]::IsInfinity($number)
    } catch {
        return $false
    }
}

function Get-ElementBounds($Element) {
    try {
        $rect = $Element.Current.BoundingRectangle
        if (
            -not (Test-FiniteNumber $rect.X) -or
            -not (Test-FiniteNumber $rect.Y) -or
            -not (Test-FiniteNumber $rect.Width) -or
            -not (Test-FiniteNumber $rect.Height)
        ) {
            return $null
        }
        return [pscustomobject]@{
            x = [int]$rect.X
            y = [int]$rect.Y
            width = [int]$rect.Width
            height = [int]$rect.Height
        }
    } catch {
        return $null
    }
}

function Get-UiSnapshot($InputObject) {
    $handle = Get-WindowHandle $InputObject
    $root = [System.Windows.Automation.AutomationElement]::FromHandle($handle)
    if ($null -eq $root) {
        throw "UI Automation could not attach to this window."
    }

    $maxDepth = if ($null -ne $InputObject.maxDepth) { [int]$InputObject.maxDepth } else { 6 }
    $maxNodes = if ($null -ne $InputObject.maxNodes) { [int]$InputObject.maxNodes } else { 400 }
    $includeOffscreen = $InputObject.includeOffscreen -eq $true
    $interactiveOnly = $InputObject.interactiveOnly -eq $true
    $query = [string]$InputObject.query
    $interactiveTypes = [System.Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
    foreach ($typeName in @("Button", "CheckBox", "ComboBox", "Edit", "Hyperlink", "ListItem", "MenuItem", "RadioButton", "TabItem")) {
        [void]$interactiveTypes.Add($typeName)
    }

    $queue = [System.Collections.Generic.Queue[object]]::new()
    $queue.Enqueue([pscustomobject]@{ element = $root; path = @(); depth = 0 })
    $rows = [System.Collections.Generic.List[object]]::new()
    $truncated = $false

    while ($queue.Count -gt 0) {
        if ($rows.Count -ge $maxNodes) {
            $truncated = $true
            break
        }
        $entry = $queue.Dequeue()
        $element = $entry.element
        try {
            $current = $element.Current
            $offscreen = [bool]$current.IsOffscreen
        } catch {
            continue
        }
        if (-not $includeOffscreen -and $offscreen) {
            continue
        }

        if ($entry.depth -lt $maxDepth) {
            $children = @(Get-ControlChildren $element)
            for ($index = 0; $index -lt $children.Count; $index++) {
                $nextPath = @($entry.path) + $index
                $queue.Enqueue([pscustomobject]@{
                    element = $children[$index]
                    path = $nextPath
                    depth = $entry.depth + 1
                })
            }
        }

        try {
            $controlType = $current.ControlType.ProgrammaticName.Replace("ControlType.", "")
            $patterns = @(Get-PatternNames $element)
            if ($interactiveOnly -and $patterns.Count -eq 0 -and -not $interactiveTypes.Contains($controlType)) {
                continue
            }
            if (-not [string]::IsNullOrWhiteSpace($query)) {
                $needle = $query.ToLowerInvariant()
                $haystack = "$($current.Name)`t$($current.AutomationId)`t$controlType".ToLowerInvariant()
                if (-not $haystack.Contains($needle)) {
                    continue
                }
            }

            $elementBounds = Get-ElementBounds $element
            $rows.Add([pscustomobject]@{
                path = @($entry.path)
                depth = $entry.depth
                controlType = $controlType
                name = $current.Name
                automationId = $current.AutomationId
                className = $current.ClassName
                enabled = [bool]$current.IsEnabled
                offscreen = $offscreen
                keyboardFocusable = [bool]$current.IsKeyboardFocusable
                patterns = $patterns
                bounds = $elementBounds
            })
        } catch {
            continue
        }
    }

    return [pscustomobject]@{
        handle = $handle.ToInt64()
        title = Get-WindowTitle $handle
        bounds = Get-WindowBounds $handle
        nodes = @($rows)
        truncated = $truncated
    }
}

function Resolve-Element([IntPtr]$Handle, $Path) {
    $element = [System.Windows.Automation.AutomationElement]::FromHandle($Handle)
    if ($null -eq $element) {
        throw "UI Automation could not attach to this window."
    }
    foreach ($rawIndex in @($Path)) {
        $index = [int]$rawIndex
        $children = @(Get-ControlChildren $element)
        if ($index -lt 0 -or $index -ge $children.Count) {
            throw "The element path is stale. Call action=inspect on this window again."
        }
        $element = $children[$index]
    }
    return $element
}

function Move-CursorSmooth([int]$ScreenX, [int]$ScreenY, [int]$Steps = 12) {
    $start = [DshComputerUse.Native+POINT]::new()
    [void][DshComputerUse.Native]::GetCursorPos([ref]$start)
    $count = [Math]::Max(1, $Steps)
    for ($step = 1; $step -le $count; $step++) {
        $x = [int]($start.X + ($ScreenX - $start.X) * $step / $count)
        $y = [int]($start.Y + ($ScreenY - $start.Y) * $step / $count)
        [void][DshComputerUse.Native]::SetCursorPos($x, $y)
        Start-Sleep -Milliseconds 8
    }
    if (-not [DshComputerUse.Native]::SetCursorPos($ScreenX, $ScreenY)) {
        throw "The pointer move to $ScreenX,$ScreenY was rejected. Input injection is blocked by the current integrity level."
    }
}

function Click-Point([IntPtr]$Handle, [int]$X, [int]$Y, [string]$Button, [int]$ClickCount, [bool]$VisualPointer = $false) {
    $bounds = Get-WindowBounds $Handle
    $screenX = $bounds.left + $X
    $screenY = $bounds.top + $Y
    if ($VisualPointer) {
        Move-CursorSmooth $screenX $screenY
    } else {
        [void][DshComputerUse.Native]::SetCursorPos($screenX, $screenY)
    }
    $down = [DshComputerUse.Native]::MOUSEEVENTF_LEFTDOWN
    $up = [DshComputerUse.Native]::MOUSEEVENTF_LEFTUP
    if ($Button -eq "right") {
        $down = [DshComputerUse.Native]::MOUSEEVENTF_RIGHTDOWN
        $up = [DshComputerUse.Native]::MOUSEEVENTF_RIGHTUP
    } elseif ($Button -eq "middle") {
        $down = [DshComputerUse.Native]::MOUSEEVENTF_MIDDLEDOWN
        $up = [DshComputerUse.Native]::MOUSEEVENTF_MIDDLEUP
    }
    for ($i = 0; $i -lt $ClickCount; $i++) {
        [DshComputerUse.Native]::mouse_event($down, 0, 0, 0, [UIntPtr]::Zero)
        [DshComputerUse.Native]::mouse_event($up, 0, 0, 0, [UIntPtr]::Zero)
        if ($i + 1 -lt $ClickCount) {
            Start-Sleep -Milliseconds 90
        }
    }
    return [pscustomobject]@{ x = $X; y = $Y; screenX = $screenX; screenY = $screenY }
}

function Invoke-Element($Element, [string]$Button, [int]$ClickCount) {
    $patternObject = $null
    if ($Button -eq "left" -and $ClickCount -eq 1) {
        if ($Element.TryGetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern, [ref]$patternObject)) {
            ([System.Windows.Automation.InvokePattern]$patternObject).Invoke()
            return "invoke"
        }
        if ($Element.TryGetCurrentPattern([System.Windows.Automation.TogglePattern]::Pattern, [ref]$patternObject)) {
            ([System.Windows.Automation.TogglePattern]$patternObject).Toggle()
            return "toggle"
        }
        if ($Element.TryGetCurrentPattern([System.Windows.Automation.SelectionItemPattern]::Pattern, [ref]$patternObject)) {
            ([System.Windows.Automation.SelectionItemPattern]$patternObject).Select()
            return "selection-item"
        }
    }
    return "coordinates"
}

function Click-Ui($InputObject) {
    $handle = Get-WindowHandle $InputObject
    [void](Activate-Window $handle)
    $button = if ($null -ne $InputObject.button) { [string]$InputObject.button } else { "left" }
    $clickCount = if ($null -ne $InputObject.clickCount) { [int]$InputObject.clickCount } else { 1 }
    $visualPointer = $InputObject.visualPointer -eq $true

    if ($null -ne $InputObject.elementPath) {
        $element = Resolve-Element $handle @($InputObject.elementPath)
        $elementBounds = Get-ElementBounds $element
        if ($visualPointer -and $null -ne $elementBounds) {
            $centerX = [int]($elementBounds.x + $elementBounds.width / 2)
            $centerY = [int]($elementBounds.y + $elementBounds.height / 2)
            Move-CursorSmooth $centerX $centerY
        }
        $mode = Invoke-Element $element $button $clickCount
        if ($mode -ne "coordinates") {
            return [pscustomobject]@{ ok = $true; mode = $mode; handle = $handle.ToInt64() }
        }
        if ($null -eq $elementBounds) {
            throw "The target element has no finite clickable bounds. Use a fresh screenshot and coordinate click."
        }
        $windowBounds = Get-WindowBounds $handle
        $relativeX = [int]($elementBounds.x + $elementBounds.width / 2 - $windowBounds.left)
        $relativeY = [int]($elementBounds.y + $elementBounds.height / 2 - $windowBounds.top)
        $point = Click-Point $handle $relativeX $relativeY $button $clickCount $visualPointer
        return [pscustomobject]@{ ok = $true; mode = "coordinates"; handle = $handle.ToInt64(); point = $point }
    }

    if ($null -eq $InputObject.x -or $null -eq $InputObject.y) {
        throw "computer_click requires elementPath or both x and y."
    }
    $point = Click-Point $handle ([int]$InputObject.x) ([int]$InputObject.y) $button $clickCount $visualPointer
    return [pscustomobject]@{ ok = $true; mode = "coordinates"; handle = $handle.ToInt64(); point = $point }
}

function Send-UnicodeText([string]$Text) {
    if ($Text.Length -eq 0) {
        return 0
    }
    $sent = [DshComputerUse.Native]::SendUnicodeText($Text)
    if ($sent -ne $Text.Length) {
        $errorCode = [Runtime.InteropServices.Marshal]::GetLastWin32Error()
        throw "SendInput sent $sent of $($Text.Length) UTF-16 code units (Win32 error $errorCode)."
    }
    return $sent
}

function Get-VirtualKey([string]$KeyName) {
    $name = $KeyName.Trim()
    $aliases = @{
        "Ctrl" = 0x11; "Control" = 0x11; "Shift" = 0x10; "Alt" = 0x12
        "Enter" = 0x0D; "Return" = 0x0D; "Tab" = 0x09; "Escape" = 0x1B
        "Esc" = 0x1B; "Space" = 0x20; "Backspace" = 0x08; "Delete" = 0x2E
        "Home" = 0x24; "End" = 0x23; "PageUp" = 0x21; "PageDown" = 0x22
        "Up" = 0x26; "Down" = 0x28; "Left" = 0x25; "Right" = 0x27
    }
    $canonical = $name.Substring(0, 1).ToUpperInvariant() + $name.Substring(1)
    if ($aliases.ContainsKey($canonical)) {
        return [byte]$aliases[$canonical]
    }
    if ($canonical -match "^F([1-9]|1[0-9]|2[0-4])$") {
        return [byte](0x70 + [int]$Matches[1] - 1)
    }
    if ($name.Length -eq 1) {
        $char = $name.ToUpperInvariant()[0]
        if ([char]::IsLetterOrDigit($char)) {
            return [byte][int]$char
        }
        $punctuation = @{
            ';' = 0xBA
            '=' = 0xBB
            ',' = 0xBC
            '-' = 0xBD
            '.' = 0xBE
            '/' = 0xBF
            '''' = 0xDE
            '[' = 0xDB
            '\' = 0xDC
            ']' = 0xDD
        }
        if ($punctuation.ContainsKey($name)) {
            return [byte]$punctuation[$name]
        }
    }
    throw "Unsupported key: $KeyName"
}

function Send-KeyChord([string]$Chord) {
    $parts = @($Chord -split "\+" | Where-Object { $_ -ne "" })
    if ($parts.Count -eq 0) {
        throw "The key chord is empty."
    }
    $modifiers = [System.Collections.Generic.List[byte]]::new()
    if ($parts.Count -gt 1) {
        for ($partIndex = 0; $partIndex -lt $parts.Count - 1; $partIndex++) {
            $modifiers.Add((Get-VirtualKey $parts[$partIndex]))
        }
    }
    $key = Get-VirtualKey $parts[$parts.Count - 1]
    foreach ($modifier in $modifiers) {
        [DshComputerUse.Native]::keybd_event($modifier, 0, 0, [UIntPtr]::Zero)
    }
    [DshComputerUse.Native]::keybd_event($key, 0, 0, [UIntPtr]::Zero)
    [DshComputerUse.Native]::keybd_event($key, 0, [DshComputerUse.Native]::KEYEVENTF_KEYUP, [UIntPtr]::Zero)
    for ($index = $modifiers.Count - 1; $index -ge 0; $index--) {
        [DshComputerUse.Native]::keybd_event($modifiers[$index], 0, [DshComputerUse.Native]::KEYEVENTF_KEYUP, [UIntPtr]::Zero)
    }
}

function Type-Ui($InputObject) {
    $handle = Get-WindowHandle $InputObject
    [void](Activate-Window $handle)
    $visualPointer = $InputObject.visualPointer -eq $true
    if ($null -ne $InputObject.elementPath) {
        $element = Resolve-Element $handle @($InputObject.elementPath)
        $elementBounds = Get-ElementBounds $element
        if ($visualPointer -and $null -ne $elementBounds) {
            $centerX = [int]($elementBounds.x + $elementBounds.width / 2)
            $centerY = [int]($elementBounds.y + $elementBounds.height / 2)
            Move-CursorSmooth $centerX $centerY
        }
        $element.SetFocus()
        Start-Sleep -Milliseconds 80
    }
    if ($InputObject.replace -eq $true) {
        Send-KeyChord "Ctrl+A"
        Start-Sleep -Milliseconds 40
    }
    $sent = Send-UnicodeText ([string]$InputObject.text)
    if ($InputObject.submit -eq $true) {
        Send-KeyChord "Enter"
    }
    return [pscustomobject]@{
        ok = $true
        handle = $handle.ToInt64()
        characters = ([string]$InputObject.text).Length
        codeUnitsSent = $sent
        submitted = $InputObject.submit -eq $true
    }
}

function Key-Ui($InputObject) {
    $handle = Get-WindowHandle $InputObject
    [void](Activate-Window $handle)
    $visualPointer = $InputObject.visualPointer -eq $true
    if ($null -ne $InputObject.elementPath) {
        $element = Resolve-Element $handle @($InputObject.elementPath)
        $elementBounds = Get-ElementBounds $element
        if ($visualPointer -and $null -ne $elementBounds) {
            $centerX = [int]($elementBounds.x + $elementBounds.width / 2)
            $centerY = [int]($elementBounds.y + $elementBounds.height / 2)
            Move-CursorSmooth $centerX $centerY
        }
        $element.SetFocus()
        Start-Sleep -Milliseconds 80
    }
    Send-KeyChord ([string]$InputObject.key)
    return [pscustomobject]@{ ok = $true; handle = $handle.ToInt64(); key = [string]$InputObject.key }
}

function Open-Url-Ui($InputObject) {
    $handle = Get-WindowHandle $InputObject
    [void](Activate-Window $handle)
    $visualPointer = $InputObject.visualPointer -eq $true
    if ($visualPointer) {
        $bounds = Get-WindowBounds $handle
        Move-CursorSmooth ([int]($bounds.left + $bounds.width / 2)) ([int]($bounds.top + 42))
    }
    if ([string]::IsNullOrWhiteSpace([string]$InputObject.url)) {
        throw "url is required for open_url."
    }
    Send-KeyChord "Ctrl+L"
    Start-Sleep -Milliseconds 100
    $sent = Send-UnicodeText ([string]$InputObject.url)
    Send-KeyChord "Enter"
    return [pscustomobject]@{
        ok = $true
        handle = $handle.ToInt64()
        mode = "address-bar"
        characters = ([string]$InputObject.url).Length
        codeUnitsSent = $sent
        submitted = $true
    }
}

function Capture-Ui($InputObject) {
    $handle = Get-WindowHandle $InputObject
    if ($InputObject.activate -ne $false) {
        [void](Activate-Window $handle)
    }
    $bounds = Get-WindowBounds $handle
    if ($bounds.width -le 0 -or $bounds.height -le 0) {
        throw "The target window has invalid dimensions."
    }

    $directory = if (-not [string]::IsNullOrWhiteSpace([string]$InputObject.screenshotDir)) {
        [string]$InputObject.screenshotDir
    } else {
        Join-Path ([IO.Path]::GetTempPath()) "dsh-computer-use"
    }
    [void](New-Item -ItemType Directory -Force -Path $directory)

    $path = [string]$InputObject.path
    if ([string]::IsNullOrWhiteSpace($path)) {
        $stamp = Get-Date -Format "yyyyMMdd-HHmmss-fff"
        $path = Join-Path $directory ("window-{0}-{1}.png" -f $handle.ToInt64(), $stamp)
    } else {
        $parent = Split-Path -Parent $path
        if (-not [string]::IsNullOrWhiteSpace($parent)) {
            [void](New-Item -ItemType Directory -Force -Path $parent)
        }
    }

    $bitmap = [System.Drawing.Bitmap]::new(
        $bounds.width,
        $bounds.height,
        [System.Drawing.Imaging.PixelFormat]::Format32bppArgb
    )
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    try {
        $graphics.CopyFromScreen(
            $bounds.left,
            $bounds.top,
            0,
            0,
            $bitmap.Size,
            [System.Drawing.CopyPixelOperation]::SourceCopy
        )
        $bitmap.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
    } finally {
        $graphics.Dispose()
        $bitmap.Dispose()
    }

    return [pscustomobject]@{
        ok = $true
        handle = $handle.ToInt64()
        title = Get-WindowTitle $handle
        path = [IO.Path]::GetFullPath($path)
        width = $bounds.width
        height = $bounds.height
        bounds = $bounds
    }
}

function Scroll-Ui($InputObject) {
    $handle = Get-WindowHandle $InputObject
    [void](Activate-Window $handle)
    $bounds = Get-WindowBounds $handle
    $screenX = $bounds.left + [int]$InputObject.x
    $screenY = $bounds.top + [int]$InputObject.y
    Move-CursorSmooth $screenX $screenY
    [DshComputerUse.Native]::mouse_event(
        [DshComputerUse.Native]::MOUSEEVENTF_WHEEL,
        0,
        0,
        ([int]$InputObject.delta * 120),
        [UIntPtr]::Zero
    )
    return [pscustomobject]@{
        ok = $true
        handle = $handle.ToInt64()
        x = [int]$InputObject.x
        y = [int]$InputObject.y
        delta = [int]$InputObject.delta
    }
}

function Focus-Ui($InputObject) {
    $handle = Get-WindowHandle $InputObject
    [void](Activate-Window $handle)
    if ($null -eq $InputObject.elementPath) {
        throw "elementPath is required for focus."
    }
    $element = Resolve-Element $handle @($InputObject.elementPath)
    if ($InputObject.visualPointer -eq $true) {
        $elementBounds = Get-ElementBounds $element
        if ($null -ne $elementBounds) {
            $centerX = [int]($elementBounds.x + $elementBounds.width / 2)
            $centerY = [int]($elementBounds.y + $elementBounds.height / 2)
            Move-CursorSmooth $centerX $centerY
        }
    }
    $element.SetFocus()
    return [pscustomobject]@{ ok = $true; handle = $handle.ToInt64(); mode = "focus" }
}

function SetValue-Ui($InputObject) {
    $handle = Get-WindowHandle $InputObject
    [void](Activate-Window $handle)
    if ($null -eq $InputObject.elementPath) {
        throw "elementPath is required for set_value."
    }
    $element = Resolve-Element $handle @($InputObject.elementPath)
    $text = [string]$InputObject.text
    if ($InputObject.visualPointer -eq $true) {
        $elementBounds = Get-ElementBounds $element
        if ($null -ne $elementBounds) {
            $centerX = [int]($elementBounds.x + $elementBounds.width / 2)
            $centerY = [int]($elementBounds.y + $elementBounds.height / 2)
            Move-CursorSmooth $centerX $centerY
        }
    }
    $patternObject = $null
    if ($element.TryGetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern, [ref]$patternObject)) {
        try {
            ([System.Windows.Automation.ValuePattern]$patternObject).SetValue($text)
            return [pscustomobject]@{
                ok = $true
                handle = $handle.ToInt64()
                mode = "value-pattern"
                characters = $text.Length
            }
        } catch {}
    }
    $element.SetFocus()
    Start-Sleep -Milliseconds 80
    Send-KeyChord "Ctrl+A"
    Start-Sleep -Milliseconds 40
    $sent = Send-UnicodeText $text
    return [pscustomobject]@{
        ok = $true
        handle = $handle.ToInt64()
        mode = "keyboard-fallback"
        characters = $text.Length
        codeUnitsSent = $sent
    }
}

function Move-Ui($InputObject) {
    $handle = Get-WindowHandle $InputObject
    [void](Activate-Window $handle)
    $bounds = Get-WindowBounds $handle
    $screenX = $bounds.left + [int]$InputObject.x
    $screenY = $bounds.top + [int]$InputObject.y
    Move-CursorSmooth $screenX $screenY
    return [pscustomobject]@{
        ok = $true
        handle = $handle.ToInt64()
        x = [int]$InputObject.x
        y = [int]$InputObject.y
        screenX = $screenX
        screenY = $screenY
    }
}

function Drag-Ui($InputObject) {
    $handle = Get-WindowHandle $InputObject
    [void](Activate-Window $handle)
    $bounds = Get-WindowBounds $handle
    $fromX = $bounds.left + [int]$InputObject.x
    $fromY = $bounds.top + [int]$InputObject.y
    $toX = $bounds.left + [int]$InputObject.toX
    $toY = $bounds.top + [int]$InputObject.toY

    Move-CursorSmooth $fromX $fromY
    [DshComputerUse.Native]::mouse_event([DshComputerUse.Native]::MOUSEEVENTF_LEFTDOWN, 0, 0, 0, [UIntPtr]::Zero)
    for ($step = 1; $step -le 10; $step++) {
        $x = [int]($fromX + ($toX - $fromX) * $step / 10)
        $y = [int]($fromY + ($toY - $fromY) * $step / 10)
        [void][DshComputerUse.Native]::SetCursorPos($x, $y)
        Start-Sleep -Milliseconds 15
    }
    [DshComputerUse.Native]::mouse_event([DshComputerUse.Native]::MOUSEEVENTF_LEFTUP, 0, 0, 0, [UIntPtr]::Zero)
    return [pscustomobject]@{
        ok = $true
        handle = $handle.ToInt64()
        from = @([int]$InputObject.x, [int]$InputObject.y)
        to = @([int]$InputObject.toX, [int]$InputObject.toY)
    }
}

function Invoke-SelfTest {
    $fakeElement = [pscustomobject]@{
        Current = [pscustomobject]@{
            BoundingRectangle = [pscustomobject]@{
                X = [double]::PositiveInfinity
                Y = [double]::PositiveInfinity
                Width = [double]::PositiveInfinity
                Height = [double]::PositiveInfinity
            }
        }
    }
    $bounds = Get-ElementBounds $fakeElement
    if ($null -ne $bounds) {
        throw "Non-finite element bounds were not sanitized."
    }
    return [pscustomobject]@{
        ok = $true
        infinityBoundsSanitized = $true
    }
}

try {
    $inputObject = Get-Payload
    $result = switch ($Action) {
        "list_windows" { [pscustomobject]@{ ok = $true; windows = @(Get-VisibleWindows $inputObject) } }
        "activate" { [pscustomobject]@{ ok = $true; window = Activate-Window (Get-WindowHandle $inputObject) } }
        "snapshot" { $snapshot = Get-UiSnapshot $inputObject; $snapshot | Add-Member -NotePropertyName ok -NotePropertyValue $true -Force; $snapshot }
        "screenshot" { Capture-Ui $inputObject }
        "focus" { Focus-Ui $inputObject }
        "set_value" { SetValue-Ui $inputObject }
        "click" { Click-Ui $inputObject }
        "type" { Type-Ui $inputObject }
        "key" { Key-Ui $inputObject }
        "open_url" { Open-Url-Ui $inputObject }
        "scroll" { Scroll-Ui $inputObject }
        "drag" { Drag-Ui $inputObject }
        "move" { Move-Ui $inputObject }
        "self_test" { Invoke-SelfTest }
    }
    $result | ConvertTo-Json -Depth 20 -Compress
} catch {
    [pscustomobject]@{
        ok = $false
        error = $_.Exception.Message
        action = $Action
    } | ConvertTo-Json -Depth 8 -Compress
    exit 1
}

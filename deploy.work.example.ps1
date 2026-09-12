@{
    HostName = 'sftp.example.com'
    PortNumber = 22
    UserName = 'your-sftp-user'
    RemotePath = '/bonkproof'
    SshHostKeyFingerprint = 'ssh-ed25519 255 xx:xx:xx:xx:xx:xx:xx:xx:xx:xx:xx:xx:xx:xx:xx:xx'

    # Optional. If omitted, deploy.ps1 prompts securely each run.
    # PasswordEnvironmentVariable = 'BONKPROOF_SFTP_PASSWORD_WORK'

    # Optional when WinSCPnet.dll is not in a standard location.
    # WinScpAssemblyPath = 'C:\Path\To\WinSCPnet.dll'
}
